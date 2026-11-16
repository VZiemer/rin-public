package com.rinassistant.android.rin.finance

import com.rinassistant.android.R
import com.rinassistant.android.rin.ui.finance.statementAnalysisFailureResource
import org.junit.Assert.assertEquals
import org.junit.Test

class StatementAnalysisFailureTest {
    @Test fun `known CSV processing failures explain how to correct the selected file`() {
        mapOf(
            "statement_csv_invalid" to R.string.finance_error_csv,
            "statement_csv_unsupported_columns" to R.string.finance_error_csv_columns,
            "statement_csv_ambiguous_amount" to R.string.finance_error_csv_amount,
            "statement_csv_invalid_date" to R.string.finance_error_csv_date,
            "statement_csv_too_many_rows" to R.string.finance_error_csv_batch,
            "statement_csv_invalid_encoding" to R.string.finance_error_csv_encoding,
            "statement_csv_unsupported_currency" to R.string.finance_error_csv_currency,
            "statement_format_disabled" to R.string.finance_error_file,
            "statement_incomplete_split_file" to R.string.finance_analysis_incomplete,
        ).forEach { (code, message) -> assertEquals(code, message, statementAnalysisFailureResource(code)) }
    }

    @Test fun `missing and unknown failure codes show a safe generic explanation`() {
        listOf(null, "", "internal-error-with-sensitive-detail").forEach { code ->
            assertEquals(R.string.finance_analysis_failed, statementAnalysisFailureResource(code))
        }
    }
}
