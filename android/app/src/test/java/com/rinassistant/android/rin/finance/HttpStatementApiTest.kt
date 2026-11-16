package com.rinassistant.android.rin.finance

import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL

class HttpStatementApiTest {
    private val id = "00000000-0000-4000-8000-000000000001"
    private val row = StatementRow("2026-10-14", "Café", 1234, StatementKind.EXPENSE, "alimentacao", null)
    private class Connection(private val code: Int = 200, private val body: String = "{}") : HttpURLConnection(URL("https://api.test")) {
        val sent = ByteArrayOutputStream()
        var closed = false
        override fun connect() = Unit
        override fun disconnect() { closed = true }
        override fun usingProxy() = false
        override fun getOutputStream() = sent
        override fun getResponseCode() = code
        override fun getInputStream() = ByteArrayInputStream(body.toByteArray())
        override fun getErrorStream() = if (code >= 400) ByteArrayInputStream(body.toByteArray()) else null
    }

    @Test fun `create uses authenticated finance endpoint and exact contract without client identity`() = runBlocking {
        val connection = Connection(body = """{"id":"$id","url":"https://storage.test/file?signature=x","headers":{"content-type":"text/csv"}}""")
        var requested: URI? = null
        val api = HttpStatementApi("https://api.test/dev/", { "jwt" }, { false }, { requested = it; connection })
        val file = readStatementFile("test.csv", "data;valor\n2026-10-14;12,34".byteInputStream())
        val ticket = api.create("RIN", file, "banco", "bank")
        assertEquals("https://api.test/dev/assistants/RIN/finance/statements", requested.toString())
        assertEquals("Bearer jwt", connection.getRequestProperty("Authorization"))
        assertEquals("POST", connection.requestMethod)
        assertFalse(connection.instanceFollowRedirects)
        assertTrue(connection.closed)
        val payload = JSONObject(connection.sent.toString("UTF-8"))
        assertEquals(6, payload.length())
        assertFalse(payload.has("userId"))
        assertEquals(file.sha256, payload.getString("sha256"))
        assertEquals(file.bytes.size, payload.getInt("sizeBytes"))
        assertTrue(payload.getBoolean("consentToAnalysis"))
        assertEquals(id, ticket.id)
    }

    @Test fun `signed PUT preserves all returned headers sends raw bytes and never requests JWT`() = runBlocking {
        val connection = Connection()
        val api = HttpStatementApi("https://api.test", { error("PUT must never request an app token") }, { error("no refresh for storage") }, { connection })
        val bytes = byteArrayOf(0, 1, 127, -1)
        api.upload(StatementUpload(id, "https://storage.test/file?signature=x", mapOf(
            "content-type" to "application/pdf", "x-amz-checksum-sha256" to "checksum", "if-none-match" to "*")), bytes)
        assertEquals("PUT", connection.requestMethod)
        assertArrayEquals(bytes, connection.sent.toByteArray())
        assertEquals("checksum", connection.getRequestProperty("x-amz-checksum-sha256"))
        assertEquals("*", connection.getRequestProperty("if-none-match"))
        assertNull(connection.getRequestProperty("Authorization"))
        assertEquals(bytes.size, connection.getRequestProperty("Content-Length")?.toInt() ?: bytes.size)
        assertTrue(connection.closed)
    }

    @Test fun `401 refreshes once only on API while preserving the reviewed payload`() = runBlocking {
        val first = Connection(401)
        val second = Connection(body = """{"status":"committed","importedIds":[]}""")
        val connections = ArrayDeque(listOf(first, second))
        var token = "old"
        var refreshes = 0
        val api = HttpStatementApi("https://api.test", { token }, { token = "new"; refreshes++; true }, { connections.removeFirst() })
        api.commit("RIN", id, 7, listOf(row))
        assertEquals(1, refreshes)
        assertEquals("Bearer new", second.getRequestProperty("Authorization"))
        assertArrayEquals(first.sent.toByteArray(), second.sent.toByteArray())
        val payload = JSONObject(second.sent.toString("UTF-8"))
        assertEquals(7L, payload.getLong("revision"))
        assertTrue(payload.getBoolean("confirmed"))
        assertTrue(payload.getBoolean("duplicateReviewConfirmed"))
        assertEquals(1234L, payload.getJSONArray("rows").getJSONObject(0).getLong("amountMinor"))
        assertTrue(payload.getJSONArray("rows").getJSONObject(0).isNull("externalId"))
        assertTrue(first.closed && second.closed)
    }

    @Test fun `insecure URLs and server redirects cannot receive documents or tokens`() = runBlocking {
        val api = HttpStatementApi("http://api.test", { "jwt" }, { false }, { error("must not connect") })
        try { api.get("RIN", id); fail() }
        catch (error: StatementException) { assertEquals(StatementFailure.NOT_CONFIGURED, error.reason) }
        try { api.upload(StatementUpload(id, "http://storage.test", emptyMap()), byteArrayOf(1)); fail() }
        catch (error: StatementException) { assertEquals(StatementFailure.MALFORMED_RESPONSE, error.reason) }
        val connection = Connection(307)
        val secureApi = HttpStatementApi("https://api.test", { "jwt" }, { false }, { connection })
        try { secureApi.upload(StatementUpload(id, "https://storage.test", emptyMap()), byteArrayOf(1)); fail() }
        catch (error: StatementException) { assertEquals(StatementFailure.UPLOAD_FAILED, error.reason) }
        assertFalse(connection.instanceFollowRedirects)
        assertTrue(connection.closed)
    }

    @Test fun `API failures are sanitized and do not expose server body or signed URL`() = runBlocking {
        val connection = Connection(503, "private financial data")
        val api = HttpStatementApi("https://api.test", { "jwt" }, { false }, { connection })
        try { api.get("RIN", id); fail() }
        catch (error: StatementException) {
            assertEquals(StatementFailure.UNAVAILABLE, error.reason)
            assertFalse(error.toString().contains("private financial data"))
        }
        assertTrue(connection.closed)
    }

    @Test fun `preview decodes duplicate indexes and immutable reviewed rows for resume`() {
        val payload = JSONObject().put("id", id).put("revision", 3).put("status", "committing")
            .put("accountId", "banco").put("sourceKind", "bank")
            .put("preview", JSONObject().put("complete", true).put("rows", org.json.JSONArray(listOf(StatementJson.row(row))))
                .put("warnings", org.json.JSONArray(listOf("Confira a data"))))
            .put("potentialDuplicates", org.json.JSONArray(listOf(0)))
            .put("reviewedRows", org.json.JSONArray(listOf(StatementJson.row(row.copy(amountMinor = 2000)))))
        val job = StatementJson.job(payload)
        assertEquals(setOf(0), job.potentialDuplicates)
        assertEquals(1234L, job.rows.single().amountMinor)
        assertEquals(2000L, job.reviewedRows?.single()?.amountMinor)
        assertEquals(listOf("Confira a data"), job.warnings)
    }

    @Test fun `another 401 after refresh stops and closes both connections`() = runBlocking {
        val first = Connection(401)
        val second = Connection(401)
        val connections = ArrayDeque(listOf(first, second))
        var refreshes = 0
        val api = HttpStatementApi("https://api.test", { "jwt" }, { refreshes++; true }, { connections.removeFirst() })
        try { api.get("RIN", id); fail() }
        catch (error: StatementException) { assertEquals(StatementFailure.UNAUTHENTICATED, error.reason) }
        assertEquals(1, refreshes)
        assertTrue(connections.isEmpty())
        assertTrue(first.closed && second.closed)
    }

    @Test fun `fractional cents cannot silently truncate in a malformed preview`() = runBlocking {
        val rawRow = StatementJson.row(row).put("amountMinor", 1234.5)
        val payload = JSONObject().put("id", id).put("revision", 2).put("status", "review")
            .put("accountId", "banco").put("sourceKind", "bank")
            .put("preview", JSONObject().put("complete", true).put("rows", org.json.JSONArray(listOf(rawRow))))
        val api = HttpStatementApi("https://api.test", { "jwt" }, { false }, { Connection(body = payload.toString()) })
        try { api.get("RIN", id); fail() }
        catch (error: StatementException) { assertEquals(StatementFailure.MALFORMED_RESPONSE, error.reason) }
    }

    @Test fun `gateway 404 during create reports unpublished route and never a missing file`() = runBlocking {
        val connection = Connection(404, """{"message":"Not Found"}""")
        val api = HttpStatementApi("https://api.test", { "jwt" }, { false }, { connection })
        val file = readStatementFile("test.csv", "data;valor\n2026-10-14;12,34".byteInputStream())
        try { api.create("RIN", file, "banco", "bank"); fail() }
        catch (error: StatementException) { assertEquals(StatementFailure.ROUTE_NOT_FOUND, error.reason) }
        assertTrue(connection.closed)
    }

    @Test fun `404 distinguishes missing statement disabled assistant and absent gateway routes`() = runBlocking {
        listOf(
            """{"code":"STATEMENT_NOT_FOUND","message":"private statement information"}""" to StatementFailure.NOT_FOUND,
            """{"code":"ASSISTANT_NOT_FOUND"}""" to StatementFailure.ASSISTANT_UNAVAILABLE,
            """{"message":"Not Found"}""" to StatementFailure.ROUTE_NOT_FOUND,
            """{"code":"FINANCE_ROUTE_NOT_FOUND"}""" to StatementFailure.ROUTE_NOT_FOUND,
            """{"code":"unknown private provider error"}""" to StatementFailure.ROUTE_NOT_FOUND,
        ).forEach { (body, expected) ->
            val api = HttpStatementApi("https://api.test", { "jwt" }, { false }, { Connection(404, body) })
            try { api.get("RIN", id); fail() }
            catch (error: StatementException) {
                assertEquals(expected, error.reason)
                assertFalse(error.toString().contains("private"))
            }
        }
    }
}
