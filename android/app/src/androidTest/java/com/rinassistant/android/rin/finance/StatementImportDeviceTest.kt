package com.rinassistant.android.rin.finance

import android.os.Bundle
import androidx.test.platform.app.InstrumentationRegistry
import com.rinassistant.android.rin.app.RinApplication
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Assume.assumeNotNull
import org.junit.Test

/** Explicit diagnostic run: only reads the pending import, never sends or confirms a document. */
class StatementImportDeviceTest {
    @Test fun reportsPendingImportStatusWithoutDocumentContent() = runBlocking {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        val app = context.applicationContext as RinApplication
        val user = app.appContainer.userSessionStore.read()
        assumeNotNull(user)
        val id = PrefsPendingStatementStore(context, requireNotNull(user).userId, "RIN").read()
        assumeNotNull(id)
        val job = app.appContainer.statementApi.get("RIN", requireNotNull(id))
        assertEquals(id, job.id)
        val safeCodes = setOf("statement_incomplete_split_file", "statement_analysis_failed", "statement_file_mismatch")
        instrumentation.sendStatus(0, Bundle().apply {
            putString("finance_status", job.status.wire)
            putString("finance_error", job.errorCode?.takeIf { it in safeCodes } ?: "none_or_other")
        })
    }

    @Test fun preparesBomBankCsvOnAndroidWithoutUploading() {
        val csv = "\uFEFFdata,hora,tipo,\"origem / destino\",valor,\"forma de pagamento\"\n" +
            "16/10/2026,12:00,Saída,Loja fictícia,\"-R$ 12,34\",Pix\n".repeat(142)
        val file = readStatementFile("extrato.csv", csv.byteInputStream())
        val batch = prepareStatementBatch(file)
        assertEquals(142, batch.totalRows)
        assertEquals(listOf(25, 25, 25, 25, 25, 17), batch.rowCounts)
        assertTrue(batch.parts.all { it.format == "csv" && it.bytes.isNotEmpty() && it.sha256.length == 64 })
    }
}
