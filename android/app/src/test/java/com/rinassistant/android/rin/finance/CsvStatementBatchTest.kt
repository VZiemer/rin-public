package com.rinassistant.android.rin.finance

import org.junit.Assert.*
import org.junit.Test
import java.nio.charset.Charset
import java.security.MessageDigest

class CsvStatementBatchTest {
    private val header = "data,hora,tipo,\"origem / destino\",valor,\"forma de pagamento\""
    private fun records(count: Int) = (1..count).map { index ->
        "14/10/2026,12:00,Saída,\"Loja fictícia $index\",\"-R$ 12,34\",Pix"
    }
    private fun file(text: String) = readStatementFile("extrato.csv", text.byteInputStream())

    @Test fun `bank layout with BOM and 142 records splits without dropping changing or repeating records`() {
        val original = records(142)
        val batch = prepareStatementBatch(file("\uFEFF" + header + "\n" + original.joinToString("\n") + "\n"))
        assertEquals(142, batch.totalRows)
        assertEquals(listOf(25, 25, 25, 25, 25, 17), batch.rowCounts)
        val rebuilt = batch.parts.flatMap { part ->
            val lines = part.bytes.toString(Charsets.UTF_8).lines().filter { it.isNotEmpty() }
            assertEquals(header, lines.first())
            assertFalse(part.bytes.take(3).toByteArray().contentEquals(byteArrayOf(0xEF.toByte(), 0xBB.toByte(), 0xBF.toByte())))
            assertEquals(MessageDigest.getInstance("SHA-256").digest(part.bytes).joinToString("") { "%02x".format(it) }, part.sha256)
            lines.drop(1)
        }
        assertEquals(original, rebuilt)
        assertEquals("extrato-parte-6-de-6.csv", batch.parts.last().name)
    }

    @Test fun `quoted newlines escaped quotes and decimal commas never split a transaction`() {
        val row1 = "16/10/2026,\"Compra na loja \"\"A\"\"\nsegunda linha\",\"R$ 12,34\""
        val row2 = "16/10/2026,Outra compra,\"-R$ 1.234,56\""
        val batch = prepareStatementBatch(file("data,descricao,valor\r\n$row1\r\n$row2\r\n"), rowsPerPart = 1)
        assertEquals(listOf(1, 1), batch.rowCounts)
        assertEquals("data,descricao,valor\n$row1\n", batch.parts[0].bytes.toString(Charsets.UTF_8))
        assertEquals("data,descricao,valor\n$row2\n", batch.parts[1].bytes.toString(Charsets.UTF_8))
    }

    @Test fun `small UTF8 file keeps original bytes and checksum`() {
        val original = file(header + "\r\n" + records(25).joinToString("\r\n") + "\r\n")
        val batch = prepareStatementBatch(original)
        assertSame(original, batch.parts.single())
        assertEquals(listOf(25), batch.rowCounts)
    }

    @Test fun `Windows 1252 and UTF16 CSV copies become UTF8 without changing field text`() {
        val text = "data;descricao;valor\r\n16/10/2026;Café fictício;12,34\r\n"
        listOf(Charset.forName("windows-1252"), Charsets.UTF_16).forEach { encoding ->
            val original = readStatementFile("extrato.csv", text.toByteArray(encoding).inputStream())
            val result = prepareStatementBatch(original).parts.single().bytes.toString(Charsets.UTF_8)
            assertEquals("data;descricao;valor\n16/10/2026;Café fictício;12,34\n", result)
        }
    }

    @Test fun `blank lines do not count as transactions and last record needs no newline`() {
        val batch = prepareStatementBatch(file("\n\r\ndata;valor\n\n16/10/2026;12,34\n\n16/10/2026;5,00"), 1)
        assertEquals(listOf(1, 1), batch.rowCounts)
        assertEquals(2, batch.totalRows)
    }

    @Test fun `malformed quoted fields mismatched columns and header-only files are explicit CSV errors`() {
        listOf("data,valor\n16/10/2026,\"12,34\n", "data,valor\n16/10/2026,12,34", "data,valor\n", "data,valor\n\u0000").forEach { text ->
            try { prepareStatementBatch(file(text)); fail("Expected invalid CSV") }
            catch (error: StatementException) { assertEquals(StatementFailure.INVALID_CSV, error.reason) }
        }
    }

    @Test fun `preparation rejects PDF documents even when file reader is bypassed`() {
        val pdf = StatementFile("extrato.pdf", "pdf", "%PDF-1.7\n".toByteArray(), "0".repeat(64))
        try { prepareStatementBatch(pdf); fail("Expected disabled format") }
        catch (error: StatementException) { assertEquals(StatementFailure.INVALID_FILE, error.reason) }
    }

    @Test fun `splitting is deterministic so reopening the same file keeps import identities`() {
        val original = file("\uFEFF$header\n${records(30).joinToString("\n")}\n")
        val first = prepareStatementBatch(original)
        val second = prepareStatementBatch(original)
        assertEquals(first.parts.map { it.sha256 }, second.parts.map { it.sha256 })
        assertEquals(first.rowCounts, second.rowCounts)
    }

    @Test fun `preparation bounds record count and repeated header memory`() {
        listOf("data;valor\n" + "2026-10-14;12,34\n".repeat(2501),
            "h".repeat(500_000) + ";valor\n" + "2026-10-14;12,34\n".repeat(450)).forEach { text ->
            try { prepareStatementBatch(file(text)); fail("Expected bounded preparation") }
            catch (error: StatementException) { assertEquals(StatementFailure.CSV_BATCH_TOO_LARGE, error.reason) }
        }
    }
}
