package com.rinassistant.android.rin.finance

import java.nio.ByteBuffer
import java.nio.charset.Charset
import java.nio.charset.CodingErrorAction

// Small parts keep transaction review manageable and allow imports to resume between parts.
const val CSV_ROWS_PER_ANALYSIS = 25
private const val MAX_CSV_BATCH_ROWS = 2500

data class StatementBatch(val parts: List<StatementFile>, val rowCounts: List<Int>) {
    val totalRows: Int get() = rowCounts.sum()
}

/** Splits records, never physical lines, so quoted descriptions and decimal commas remain intact. */
fun prepareStatementBatch(file: StatementFile, rowsPerPart: Int = CSV_ROWS_PER_ANALYSIS): StatementBatch {
    require(rowsPerPart in 1..MAX_STATEMENT_ROWS)
    if (file.format != "csv") throw StatementException(StatementFailure.INVALID_FILE)
    val text = decodeCsv(file.bytes).removePrefix("\uFEFF")
    val records = csvRecords(text)
    if (records.size < 2) throw StatementException(StatementFailure.INVALID_CSV)
    val header = records.first()
    val delimiter = listOf(',', ';', '\t').maxBy { separatorCount(header, it) }
    val columns = separatorCount(header, delimiter)
    if (records.any { separatorCount(it, delimiter) != columns }) throw StatementException(StatementFailure.INVALID_CSV)
    val chunks = records.drop(1).chunked(rowsPerPart)
    val preparedBytes = (header.toByteArray(Charsets.UTF_8).size + 1L) * chunks.size +
        records.drop(1).sumOf { it.toByteArray(Charsets.UTF_8).size + 1L }
    if (preparedBytes > MAX_STATEMENT_BYTES * 2L) throw StatementException(StatementFailure.CSV_BATCH_TOO_LARGE)
    val parts = chunks.mapIndexed { index, rows ->
        if (chunks.size == 1 && text.toByteArray(Charsets.UTF_8).contentEquals(file.bytes)) file
        else {
            val name = if (chunks.size == 1) file.name else
                "${file.name.substringBeforeLast('.')}-parte-${index + 1}-de-${chunks.size}.csv"
            readStatementFile(name, (header + "\n" + rows.joinToString("\n") + "\n").byteInputStream(Charsets.UTF_8))
        }
    }
    return StatementBatch(parts, chunks.map { it.size })
}

private fun decodeCsv(bytes: ByteArray): String {
    val charset = when {
        bytes.size >= 2 && bytes[0] == 0xFF.toByte() && bytes[1] == 0xFE.toByte() -> Charsets.UTF_16
        bytes.size >= 2 && bytes[0] == 0xFE.toByte() && bytes[1] == 0xFF.toByte() -> Charsets.UTF_16
        else -> Charsets.UTF_8
    }
    fun decode(encoding: Charset) = encoding.newDecoder()
        .onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
        .decode(ByteBuffer.wrap(bytes)).toString()
    val text = try { decode(charset) } catch (_: java.nio.charset.CharacterCodingException) {
        if (charset != Charsets.UTF_8) throw StatementException(StatementFailure.INVALID_CSV)
        try { decode(Charset.forName("windows-1252")) }
        catch (_: java.nio.charset.CharacterCodingException) { throw StatementException(StatementFailure.INVALID_CSV) }
    }
    if (text.any { it == '\u0000' }) throw StatementException(StatementFailure.INVALID_CSV)
    return text
}

private fun csvRecords(text: String): List<String> {
    val records = mutableListOf<String>()
    var quoted = false
    var start = 0
    var index = 0
    fun appendRecord(record: String) {
        if (record.isBlank()) return
        if (records.size >= MAX_CSV_BATCH_ROWS + 1) throw StatementException(StatementFailure.CSV_BATCH_TOO_LARGE)
        records.add(record)
    }
    while (index < text.length) {
        val char = text[index]
        when {
            char == '"' && quoted && text.getOrNull(index + 1) == '"' -> index++
            char == '"' -> quoted = !quoted
            !quoted && (char == '\n' || char == '\r') -> {
                appendRecord(text.substring(start, index))
                if (char == '\r' && text.getOrNull(index + 1) == '\n') index++
                start = index + 1
            }
        }
        index++
    }
    if (quoted) throw StatementException(StatementFailure.INVALID_CSV)
    appendRecord(text.substring(start))
    return records
}

private fun separatorCount(record: String, delimiter: Char): Int {
    var quoted = false
    var count = 0
    var index = 0
    while (index < record.length) {
        val char = record[index]
        when {
            char == '"' && quoted && record.getOrNull(index + 1) == '"' -> index++
            char == '"' -> quoted = !quoted
            !quoted && char == delimiter -> count++
        }
        index++
    }
    return count
}
