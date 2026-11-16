package com.rinassistant.android.rin.finance

import android.util.Log
import androidx.test.platform.app.InstrumentationRegistry
import com.rinassistant.android.rin.app.RinApplication
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test

/** Opt-in integration check: uses the signed-in dev session and uploads only synthetic CSV data.
 * Never commits rows or changes the user's pending import. Originals/previews retain their TTL.
 */
class StatementUploadDeviceTest {
    @Test fun csvUploadReachesReview() = runBlocking {
        checkUpload("csv", """
            Data,Descricao,Valor,Moeda,Tipo
            2026-10-14,Mercado ficticio,-12.34,BRL,Despesa
        """.trimIndent().toByteArray())
    }

    @Test fun bankCsv25RowsReachesReview() = runBlocking {
        checkUpload("csv", bankCsv(25), 25)
    }

    @Test fun bankCsv100RowsReachesReviewWithoutModelTokenLimit() = runBlocking {
        checkUpload("csv", bankCsv(100), 100)
    }

    @Test fun pdfCreationIsDisabledByBackend() = runBlocking {
        assumeTrue(InstrumentationRegistry.getArguments().getString("statementUploadSmoke") == "true")
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val api = (context.applicationContext as RinApplication).appContainer.statementApi
        val file = readStatementFile("synthetic.csv", bankCsv(1).inputStream()).copy(format = "pdf")
        try {
            api.create("RIN", file, "codex-upload-smoke", "bank")
            fail("The backend must reject PDF before issuing an upload ticket")
        } catch (error: StatementException) {
            assertEquals(StatementFailure.INVALID_INPUT, error.reason)
        }
    }

    private fun bankCsv(rows: Int): ByteArray = ("\uFEFFdata,hora,tipo,\"origem / destino\",valor,\"forma de pagamento\"\n" +
        (1..rows).joinToString("\n") { "14/10/2026,12:00,Saída,Loja fictícia $it,\"−R$ 12,34\",Pix" }).toByteArray()

    private suspend fun checkUpload(format: String, bytes: ByteArray, expectedRows: Int = 1) {
        assumeTrue("Pass -e statementUploadSmoke true to invoke the dev CSV backend",
            InstrumentationRegistry.getArguments().getString("statementUploadSmoke") == "true")
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val container = (context.applicationContext as RinApplication).appContainer
        assertNotNull("Sign in on the development device first", container.authRepository.getSession())
        val file = readStatementFile("synthetic.$format", bytes.inputStream())
        val ticket = container.statementApi.create("RIN", file, "codex-upload-smoke", "bank")
        Log.i("RinStatementSmoke", "created format=$format id=${ticket.id}")
        container.statementApi.upload(ticket, file.bytes)
        Log.i("RinStatementSmoke", "uploaded format=$format id=${ticket.id}")
        val job = withTimeout(240_000) {
            var current = container.statementApi.get("RIN", ticket.id)
            Log.i("RinStatementSmoke", "status format=$format value=${current.status}")
            while (current.status in setOf(StatementStatus.UPLOADED_PENDING, StatementStatus.PROCESSING)) {
                delay(5_000)
                current = container.statementApi.get("RIN", ticket.id)
            }
            current
        }
        assertEquals("Analysis failure code: ${job.errorCode}", StatementStatus.REVIEW, job.status)
        assertEquals(expectedRows, job.rows.size)
        assertTrue(job.rows.all { it.amountMinor == 1234L })
        assertTrue(job.rows.all { it.occurredOn == "2026-10-14" })
        assertTrue(job.rows.all { it.kind == StatementKind.EXPENSE })
        Log.i("RinStatementSmoke", "review format=$format id=${ticket.id} rows=${job.rows.size}")
    }
}
