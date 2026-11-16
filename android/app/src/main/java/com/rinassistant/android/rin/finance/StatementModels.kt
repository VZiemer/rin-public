package com.rinassistant.android.rin.finance

import java.math.BigDecimal
import java.time.LocalDate
import java.util.Locale

const val MAX_STATEMENT_BYTES = 4_000_000
const val MAX_STATEMENT_ROWS = 100

enum class StatementFailure {
    FILE_TOO_LARGE, INVALID_FILE, INVALID_CSV, CSV_BATCH_TOO_LARGE, INVALID_INPUT, NOT_CONFIGURED, UNAUTHENTICATED,
    UNAVAILABLE, ROUTE_NOT_FOUND, ASSISTANT_UNAVAILABLE, OFFLINE, TIMEOUT, CONFLICT, NOT_FOUND,
    UPLOAD_FAILED, MALFORMED_RESPONSE, BACKEND,
}

class StatementException(val reason: StatementFailure) : Exception(reason.name)

enum class StatementKind(val wire: String) {
    INCOME("income"), EXPENSE("expense"), TRANSFER("transfer"), CARD_PAYMENT("card_payment"), UNKNOWN("unknown");
    companion object {
        fun fromWire(value: String): StatementKind = entries.firstOrNull { it.wire == value }
            ?: throw StatementException(StatementFailure.MALFORMED_RESPONSE)
    }
}

enum class StatementStatus(val wire: String) {
    UPLOADED_PENDING("uploaded_pending"), PROCESSING("processing"), REVIEW("review"),
    COMMITTING("committing"), COMMITTED("committed"), FAILED("failed");
    companion object {
        fun fromWire(value: String): StatementStatus = entries.firstOrNull { it.wire == value }
            ?: throw StatementException(StatementFailure.MALFORMED_RESPONSE)
    }
}

data class StatementFile(val name: String, val format: String, val bytes: ByteArray, val sha256: String)
data class StatementUpload(val id: String, val url: String, val headers: Map<String, String>)
data class StatementRow(
    val occurredOn: String,
    val description: String,
    val amountMinor: Long,
    val kind: StatementKind,
    val category: String,
    val externalId: String?,
)

data class StatementJob(
    val id: String,
    val revision: Long,
    val status: StatementStatus,
    val accountId: String,
    val sourceKind: String,
    val rows: List<StatementRow> = emptyList(),
    val reviewedRows: List<StatementRow>? = null,
    val warnings: List<String> = emptyList(),
    val potentialDuplicates: Set<Int> = emptySet(),
    val errorCode: String? = null,
)

data class StatementRowDraft(
    val originalIndex: Int,
    val occurredOn: String,
    val description: String,
    val amount: String,
    val kind: StatementKind,
    val category: String,
    val externalId: String?,
    val included: Boolean = true,
) {
    fun toRow(): StatementRow? {
        val date = occurredOn.trim()
        if (!Regex("\\d{4}-\\d{2}-\\d{2}").matches(date) || runCatching { LocalDate.parse(date) }.isFailure) return null
        // No grouping separators: both 1234,56 and 1234.56 are accepted without guessing.
        if (!Regex("[0-9]+([.,][0-9]{1,2})?").matches(amount.trim())) return null
        val minor = runCatching { BigDecimal(amount.trim().replace(',', '.')).movePointRight(2).longValueExact() }.getOrNull()
            ?: return null
        if (minor !in 1..1_000_000_000_000L || kind == StatementKind.UNKNOWN) return null
        if (description.trim().length !in 1..200 || category.trim().length !in 1..80) return null
        return StatementRow(date, description.trim(), minor, kind, category.trim(), externalId)
    }

    companion object {
        fun from(row: StatementRow, index: Int) = StatementRowDraft(
            index, row.occurredOn, row.description,
            String.format(Locale.ROOT, "%d,%02d", row.amountMinor / 100, row.amountMinor % 100),
            row.kind, row.category, row.externalId,
        )
    }
}

fun validStatementAccount(value: String): Boolean = Regex("[A-Za-z0-9_-]{1,80}").matches(value)

interface StatementApi {
    suspend fun create(assistantId: String, file: StatementFile, accountId: String, sourceKind: String): StatementUpload
    suspend fun upload(ticket: StatementUpload, bytes: ByteArray)
    suspend fun get(assistantId: String, id: String): StatementJob
    suspend fun commit(assistantId: String, id: String, revision: Long, rows: List<StatementRow>)
}

interface PendingStatementStore {
    fun read(): String?
    fun save(id: String)
    fun clear()
}
