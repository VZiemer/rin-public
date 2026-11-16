package com.rinassistant.android.rin.finance

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test

class StatementImportControllerTest {
    private val id = "00000000-0000-4000-8000-000000000001"
    private val row = StatementRow("2026-10-14", "Mercado", 2500, StatementKind.EXPENSE, "mercado", null)
    private val file = readStatementFile("extrato.csv", "data;valor\n2026-10-14;25,00".byteInputStream())
    private fun job(status: StatementStatus = StatementStatus.REVIEW, rows: List<StatementRow> = listOf(row), revision: Long = 2) =
        StatementJob(id, revision, status, "banco", "bank", rows, potentialDuplicates = setOf(0))

    private class Store(var id: String? = null) : PendingStatementStore {
        override fun read() = id
        override fun save(id: String) { this.id = id }
        override fun clear() { id = null }
    }
    private inner class Api : StatementApi {
        val events = mutableListOf<String>()
        var current = job()
        var onCommit: () -> Unit = {}
        var onCreate: () -> Unit = {}
        var onUpload: () -> Unit = {}
        var onGet: () -> Unit = {}
        var sentRows: List<StatementRow>? = null
        var sentRevision: Long? = null
        override suspend fun create(assistantId: String, file: StatementFile, accountId: String, sourceKind: String): StatementUpload {
            events += "create:$assistantId:$accountId:$sourceKind"
            onCreate()
            return StatementUpload(id, "https://upload.test", emptyMap())
        }
        override suspend fun upload(ticket: StatementUpload, bytes: ByteArray) { events += "upload"; onUpload() }
        override suspend fun get(assistantId: String, id: String): StatementJob { events += "get"; onGet(); return current }
        override suspend fun commit(assistantId: String, id: String, revision: Long, rows: List<StatementRow>) {
            events += "commit"; sentRows = rows; sentRevision = revision; onCommit()
        }
    }
    private fun controller(api: Api, store: Store = Store()) = StatementImportController("RIN", api, store, {}, 2)

    @Test fun `upload requires consent and saves recovery ID before PUT but never commits automatically`() = runBlocking {
        val api = Api()
        val store = Store()
        api.onUpload = { assertEquals(id, store.id) }
        val controller = controller(api, store)
        controller.selectFile { file }
        controller.start("banco", "bank")
        assertTrue(api.events.isEmpty())
        controller.consent(true)
        controller.start("banco", "bank")
        assertEquals(listOf("create:RIN:banco:bank", "upload", "get"), api.events)
        assertEquals(id, store.id)
        assertEquals(StatementStatus.REVIEW, controller.state.value.job?.status)
        assertFalse(controller.state.value.canCommit)
        assertNull(controller.state.value.file)
    }

    @Test fun `unknown rows block commit until corrected or excluded and edits reset both confirmations`() = runBlocking {
        val api = Api().apply { current = job(rows = listOf(row, row.copy(kind = StatementKind.UNKNOWN))) }
        val controller = controller(api, Store(id))
        controller.resume()
        controller.confirmRows(true); controller.confirmDuplicates(true)
        assertFalse(controller.state.value.canCommit)
        controller.commit()
        assertNull(api.sentRows)
        controller.edit(1) { it.copy(included = false) }
        assertFalse(controller.state.value.rowsConfirmed)
        assertFalse(controller.state.value.duplicatesConfirmed)
        controller.confirmRows(true); controller.confirmDuplicates(true)
        assertTrue(controller.state.value.canCommit)
        controller.commit()
        assertEquals(listOf(row), api.sentRows)
        assertEquals(2L, api.sentRevision)
        assertEquals(StatementStatus.COMMITTED, controller.state.value.job?.status)
    }

    @Test fun `interrupted commit locks editing and resumes exactly the server reviewed rows`() = runBlocking {
        val api = Api()
        val controller = controller(api, Store(id))
        controller.resume()
        controller.edit(0) { it.copy(amount = "30,00") }
        controller.confirmRows(true); controller.confirmDuplicates(true)
        val reviewed = listOf(row.copy(amountMinor = 3000))
        api.onCommit = {
            api.current = job(StatementStatus.COMMITTING, revision = 3).copy(reviewedRows = reviewed)
            throw StatementException(StatementFailure.TIMEOUT)
        }
        controller.commit()
        assertFalse(controller.state.value.editable)
        controller.edit(0) { it.copy(amount = "999,00") }
        api.onCommit = {}
        controller.commit()
        assertEquals(reviewed, api.sentRows)
        assertEquals(3L, api.sentRevision)
        assertEquals(StatementStatus.COMMITTED, controller.state.value.job?.status)
    }

    @Test fun `unknown commit result blocks edits and new import until GET succeeds`() = runBlocking {
        val api = Api()
        val controller = controller(api, Store(id))
        controller.resume()
        controller.confirmRows(true); controller.confirmDuplicates(true)
        api.onCommit = { throw StatementException(StatementFailure.TIMEOUT) }
        api.onGet = { throw StatementException(StatementFailure.OFFLINE) }
        controller.commit()
        assertTrue(controller.state.value.commitUncertain)
        controller.newImport()
        assertNotNull(controller.state.value.job)
        controller.edit(0) { it.copy(amount = "999,00") }
        assertEquals("25,00", controller.state.value.drafts.single().amount)
        api.onGet = {}
        api.current = job(StatementStatus.COMMITTED)
        controller.resume()
        assertFalse(controller.state.value.commitUncertain)
        assertEquals(StatementStatus.COMMITTED, controller.state.value.job?.status)
    }

    @Test fun `lost response after successful commit is recognized without replay`() = runBlocking {
        val api = Api()
        val controller = controller(api, Store(id))
        controller.resume()
        controller.confirmRows(true); controller.confirmDuplicates(true)
        api.onCommit = { api.current = job(StatementStatus.COMMITTED); throw StatementException(StatementFailure.TIMEOUT) }
        controller.commit()
        assertEquals(StatementStatus.COMMITTED, controller.state.value.job?.status)
        assertNull(controller.state.value.error)
        assertEquals(1, api.events.count { it == "commit" })
    }

    @Test fun `new server revision requires a fresh human review`() = runBlocking {
        val api = Api()
        val controller = controller(api, Store(id))
        controller.resume()
        controller.confirmRows(true); controller.confirmDuplicates(true)
        api.onCommit = { api.current = job(revision = 4); throw StatementException(StatementFailure.CONFLICT) }
        controller.commit()
        assertFalse(controller.state.value.canCommit)
        assertFalse(controller.state.value.rowsConfirmed)
        assertFalse(controller.state.value.duplicatesConfirmed)
    }

    @Test fun `polling is bounded and can be resumed without another upload`() = runBlocking {
        val api = Api().apply { current = job(StatementStatus.PROCESSING) }
        val controller = controller(api, Store(id))
        controller.resume()
        assertEquals(2, api.events.size)
        assertFalse(controller.state.value.busy)
        api.current = job()
        controller.resume()
        assertEquals(StatementStatus.REVIEW, controller.state.value.job?.status)
        assertEquals(listOf("get", "get", "get"), api.events)
    }

    @Test fun `lifecycle cancellation resets busy state and never becomes a generic failure`() = runBlocking {
        val api = Api().apply { onGet = { throw CancellationException() } }
        val controller = controller(api, Store(id))
        try { controller.resume(); fail() } catch (_: CancellationException) { }
        assertFalse(controller.state.value.busy)
        assertNull(controller.state.value.error)
    }

    @Test fun `upload failure preserves pending ID and restart checks processing without creating a second job`() = runBlocking {
        val api = Api().apply { onUpload = { throw StatementException(StatementFailure.OFFLINE) } }
        val store = Store()
        val first = controller(api, store)
        first.selectFile { file }; first.consent(true); first.start("banco", "bank")
        assertEquals(id, store.id)
        assertEquals(StatementFailure.OFFLINE, first.state.value.error)
        val reopened = controller(api, store)
        reopened.resume()
        assertEquals(StatementStatus.REVIEW, reopened.state.value.job?.status)
        assertEquals(1, api.events.count { it.startsWith("create:") })
        assertFalse(reopened.state.value.rowsConfirmed)
    }

    @Test fun `selecting a replacement file clears consent and failure cannot upload an old file`() = runBlocking {
        val api = Api()
        val controller = controller(api)
        controller.selectFile { file }; controller.consent(true)
        controller.selectFile { throw StatementException(StatementFailure.INVALID_FILE) }
        assertNull(controller.state.value.file)
        assertFalse(controller.state.value.consent)
        controller.start("banco", "bank")
        assertTrue(api.events.isEmpty())
    }

    @Test fun `unpublished API keeps the exact selected file for retry and does not create a pending job`() = runBlocking {
        val api = Api().apply { onCreate = { throw StatementException(StatementFailure.ROUTE_NOT_FOUND) } }
        val store = Store()
        val controller = controller(api, store)
        controller.selectFile { file }; controller.consent(true); controller.start("banco", "bank")
        assertEquals(StatementFailure.ROUTE_NOT_FOUND, controller.state.value.error)
        assertSame(file, controller.state.value.file)
        assertTrue(controller.state.value.consent)
        assertNull(controller.state.value.job)
        assertNull(store.id)
        assertFalse(api.events.contains("upload"))
        api.onCreate = {}
        controller.start("banco", "bank")
        assertEquals(StatementStatus.REVIEW, controller.state.value.job?.status)
        assertEquals(id, store.id)
    }

    @Test fun `large CSV prepares parts locally and advances only after an explicit successful commit`() = runBlocking {
        val api = Api()
        val controller = controller(api)
        val csv = readStatementFile("extrato.csv", ("data;valor\n" + "2026-10-14;25,00\n".repeat(30)).byteInputStream())
        controller.selectFile { csv }
        assertEquals(listOf(25, 5), controller.state.value.batch?.rowCounts)
        assertEquals(0, controller.state.value.partIndex)
        assertTrue(api.events.isEmpty())
        controller.nextPart()
        assertEquals(0, controller.state.value.partIndex)
        controller.consent(true); controller.start("banco", "bank")
        controller.nextPart()
        assertEquals(StatementStatus.REVIEW, controller.state.value.job?.status)
        controller.confirmRows(true); controller.confirmDuplicates(true); controller.commit()
        val beforeNext = api.events.toList()
        controller.nextPart()
        assertEquals(beforeNext, api.events)
        assertEquals(1, controller.state.value.partIndex)
        assertNull(controller.state.value.job)
        assertFalse(controller.state.value.consent)
        assertFalse(controller.state.value.hasNextPart)
        assertEquals("extrato-parte-2-de-2.csv", controller.state.value.file?.name)
    }

    @Test fun `reopening a CSV can select the remaining part but each selection resets consent`() = runBlocking {
        val api = Api()
        val controller = controller(api)
        val csv = readStatementFile("extrato.csv", ("data;valor\n" + "2026-10-14;25,00\n".repeat(30)).byteInputStream())
        controller.selectFile { csv }; controller.consent(true); controller.choosePart(1)
        assertFalse(controller.state.value.consent)
        assertEquals(1, controller.state.value.partIndex)
        controller.consent(true); controller.start("banco", "bank")
        controller.choosePart(0)
        assertEquals(1, controller.state.value.partIndex)
        assertEquals(StatementStatus.REVIEW, controller.state.value.job?.status)
    }
}
