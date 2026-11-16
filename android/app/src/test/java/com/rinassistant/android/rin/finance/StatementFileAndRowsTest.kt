package com.rinassistant.android.rin.finance

import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayInputStream
import java.security.MessageDigest

class StatementFileAndRowsTest {
    @Test fun `checksum and size use the exact selected bytes including UTF8 and line endings`() {
        val bytes = "data;descrição;valor\r\n2026-10-14;café;12,34\r\n".toByteArray()
        val file = readStatementFile("extrato.CSV", ByteArrayInputStream(bytes))
        assertEquals("csv", file.format)
        assertArrayEquals(bytes, file.bytes)
        assertEquals(MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }, file.sha256)
    }

    @Test fun `streaming enforces the decimal four MB limit even without provider metadata`() {
        val allowed = ByteArray(MAX_STATEMENT_BYTES) { 'a'.code.toByte() }
        assertEquals(MAX_STATEMENT_BYTES, readStatementFile("a.csv", allowed.inputStream()).bytes.size)
        expectFailure(StatementFailure.FILE_TOO_LARGE) {
            readStatementFile("a.csv", ByteArray(MAX_STATEMENT_BYTES + 1).inputStream())
        }
    }

    @Test fun `only nonempty CSV files are accepted and valid PDF files are rejected`() {
        listOf("a.csv" to byteArrayOf(), "a.xlsx" to "PK".toByteArray(), "a.pdf" to "%PDF-1.7\n".toByteArray()).forEach { (name, bytes) ->
            expectFailure(StatementFailure.INVALID_FILE) { readStatementFile(name, bytes.inputStream()) }
        }
    }

    @Test fun `review converts decimals exactly and rejects ambiguous or invalid amounts and dates`() {
        val row = StatementRow("2026-10-14", "Café", 123456, StatementKind.EXPENSE, "alimentacao", null)
        val draft = StatementRowDraft.from(row, 0)
        assertEquals("1234,56", draft.amount)
        assertEquals(row, draft.toRow())
        assertEquals(123456L, draft.copy(amount = "1234.56").toRow()?.amountMinor)
        listOf("1.234,56", "1,234.56", "12,345", "-10", "0", "NaN", "1e2", "10000000000,01").forEach { amount ->
            assertNull(amount, draft.copy(amount = amount).toRow())
        }
        assertNull(draft.copy(occurredOn = "2026-02-30").toRow())
        assertNull(draft.copy(occurredOn = "14/10/2026").toRow())
        assertNull(draft.copy(kind = StatementKind.UNKNOWN).toRow())
        assertNull(draft.copy(category = " ").toRow())
        assertNull(draft.copy(description = "a".repeat(201)).toRow())
    }

    @Test fun `account names match the backend and cannot become path segments`() {
        assertTrue(validStatementAccount("banco-principal_2"))
        listOf("", "minha conta", "bancão", "../RIN", "a".repeat(81)).forEach { assertFalse(validStatementAccount(it)) }
    }

    private fun expectFailure(reason: StatementFailure, block: () -> Unit) {
        try { block(); fail("Expected $reason") }
        catch (error: StatementException) { assertEquals(reason, error.reason) }
    }
}
