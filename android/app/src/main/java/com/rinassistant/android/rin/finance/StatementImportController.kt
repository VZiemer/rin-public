package com.rinassistant.android.rin.finance

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

enum class StatementActivity { IDLE, READING, UPLOADING, CHECKING, COMMITTING }

data class StatementImportState(
    val file: StatementFile? = null,
    val batch: StatementBatch? = null,
    val partIndex: Int = 0,
    val job: StatementJob? = null,
    val drafts: List<StatementRowDraft> = emptyList(),
    val activity: StatementActivity = StatementActivity.IDLE,
    val error: StatementFailure? = null,
    val consent: Boolean = false,
    val rowsConfirmed: Boolean = false,
    val duplicatesConfirmed: Boolean = false,
    val commitUncertain: Boolean = false,
) {
    val busy: Boolean get() = activity != StatementActivity.IDLE
    val partCount: Int get() = batch?.parts?.size ?: 1
    val hasNextPart: Boolean get() = partIndex + 1 < partCount
    val editable: Boolean get() = !busy && !commitUncertain && job?.status == StatementStatus.REVIEW
    val included: List<StatementRowDraft> get() = drafts.filter { it.included }
    val hasEdits: Boolean get() = job?.status == StatementStatus.REVIEW &&
        drafts != job.rows.mapIndexed { index, row -> StatementRowDraft.from(row, index) }
    val canCommit: Boolean get() = editable && rowsConfirmed && duplicatesConfirmed &&
        included.isNotEmpty() && included.all { it.toRow() != null }
}

class StatementImportController(
    private val assistantId: String,
    private val api: StatementApi,
    private val pending: PendingStatementStore,
    private val waitForNextPoll: suspend () -> Unit = { delay(5_000) },
    private val pollAttempts: Int = 60,
) {
    private val mutableState = MutableStateFlow(StatementImportState())
    val state: StateFlow<StatementImportState> = mutableState.asStateFlow()

    fun consent(value: Boolean) { if (!state.value.busy) mutableState.value = state.value.copy(consent = value) }
    fun confirmRows(value: Boolean) { if (state.value.editable) mutableState.value = state.value.copy(rowsConfirmed = value) }
    fun confirmDuplicates(value: Boolean) { if (state.value.editable) mutableState.value = state.value.copy(duplicatesConfirmed = value) }

    fun edit(index: Int, transform: (StatementRowDraft) -> StatementRowDraft) {
        if (!state.value.editable) return
        mutableState.value = state.value.copy(
            drafts = state.value.drafts.map { if (it.originalIndex == index) transform(it) else it },
            rowsConfirmed = false, duplicatesConfirmed = false,
        )
    }

    fun newImport() {
        if (state.value.busy || state.value.commitUncertain || state.value.job?.status == StatementStatus.COMMITTING) return
        pending.clear()
        mutableState.value = StatementImportState()
    }

    fun choosePart(index: Int) {
        val current = state.value
        val batch = current.batch ?: return
        if (current.busy || current.job != null || index !in batch.parts.indices) return
        mutableState.value = current.copy(file = batch.parts[index], partIndex = index, consent = false, error = null)
    }

    fun nextPart() {
        val current = state.value
        val batch = current.batch ?: return
        if (current.busy || current.commitUncertain || current.job?.status != StatementStatus.COMMITTED || !current.hasNextPart) return
        pending.clear()
        val next = current.partIndex + 1
        mutableState.value = StatementImportState(file = batch.parts[next], batch = batch, partIndex = next)
    }

    suspend fun selectFile(read: suspend () -> StatementFile) {
        if (state.value.busy || state.value.job != null) return
        mutableState.value = state.value.copy(file = null, batch = null, partIndex = 0, consent = false)
        operation(StatementActivity.READING) {
            val file = read()
            val batch = withContext(Dispatchers.Default) { prepareStatementBatch(file) }
            mutableState.value = state.value.copy(file = batch.parts.first(), batch = batch, consent = false)
        }
    }

    suspend fun start(accountId: String, sourceKind: String) {
        val current = state.value
        val file = current.file ?: return
        if (current.busy || current.job != null || !current.consent || !validStatementAccount(accountId) || sourceKind !in setOf("bank", "card")) return
        operation(StatementActivity.UPLOADING) {
            val ticket = api.create(assistantId, file, accountId, sourceKind)
            pending.save(ticket.id)
            // Preserve the job before PUT so an interrupted upload can still be checked after reopening.
            mutableState.value = state.value.copy(job = StatementJob(ticket.id, 0, StatementStatus.UPLOADED_PENDING, accountId, sourceKind))
            api.upload(ticket, file.bytes)
            mutableState.value = state.value.copy(file = null, activity = StatementActivity.CHECKING)
            poll(ticket.id)
        }
    }

    suspend fun resume() {
        if (state.value.busy) return
        val id = state.value.job?.id ?: pending.read() ?: return
        operation(StatementActivity.CHECKING) { poll(id) }
    }

    suspend fun commit() {
        val current = state.value
        val job = current.job ?: return
        if (current.busy || current.commitUncertain) return
        val rows = if (job.status == StatementStatus.COMMITTING) job.reviewedRows ?: return
            else if (current.canCommit) current.included.map { requireNotNull(it.toRow()) } else return
        mutableState.value = current.copy(commitUncertain = true)
        operation(StatementActivity.COMMITTING) {
            try {
                api.commit(assistantId, job.id, job.revision, rows)
                mutableState.value = state.value.copy(job = job.copy(status = StatementStatus.COMMITTED), commitUncertain = false)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                // A timeout can happen after some or all entries were saved. Query before permitting any edits.
                try { applyJob(api.get(assistantId, job.id)) }
                catch (cancelled: CancellationException) { throw cancelled }
                catch (_: Exception) { /* Keep the draft locked until status can be checked. */ }
                if (state.value.job?.status != StatementStatus.COMMITTED) throw error
            }
        }
    }

    private suspend fun poll(id: String) {
        repeat(pollAttempts) { attempt ->
            val job = api.get(assistantId, id)
            applyJob(job)
            if (job.status !in setOf(StatementStatus.UPLOADED_PENDING, StatementStatus.PROCESSING)) return
            if (attempt < pollAttempts - 1) waitForNextPoll()
        }
    }

    private fun applyJob(job: StatementJob) {
        val current = state.value
        val preserveDraft = job.status == StatementStatus.REVIEW && current.job?.status == StatementStatus.REVIEW &&
            current.job.revision == job.revision && current.drafts.isNotEmpty()
        val rows = if (job.status == StatementStatus.COMMITTING) requireNotNull(job.reviewedRows) else job.rows
        mutableState.value = current.copy(
            job = job, file = null, commitUncertain = false,
            drafts = if (preserveDraft) current.drafts else rows.mapIndexed { index, row -> StatementRowDraft.from(row, index) },
            rowsConfirmed = preserveDraft && current.rowsConfirmed,
            duplicatesConfirmed = preserveDraft && current.duplicatesConfirmed,
        )
    }

    private suspend fun operation(activity: StatementActivity, action: suspend () -> Unit) {
        mutableState.value = state.value.copy(activity = activity, error = null)
        try { action() }
        catch (error: CancellationException) { throw error }
        catch (error: StatementException) { mutableState.value = state.value.copy(error = error.reason) }
        catch (_: Exception) { mutableState.value = state.value.copy(error = StatementFailure.BACKEND) }
        finally { mutableState.value = state.value.copy(activity = StatementActivity.IDLE) }
    }
}
