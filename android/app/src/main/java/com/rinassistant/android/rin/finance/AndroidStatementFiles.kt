package com.rinassistant.android.rin.finance

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.security.MessageDigest

class AndroidStatementFiles(private val context: Context) {
    suspend fun read(uri: Uri): StatementFile = withContext(Dispatchers.IO) {
        val resolver = context.contentResolver
        var name: String? = null
        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (nameIndex >= 0) name = cursor.getString(nameIndex)
                val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
                if (sizeIndex >= 0 && !cursor.isNull(sizeIndex) && cursor.getLong(sizeIndex) > MAX_STATEMENT_BYTES) {
                    throw StatementException(StatementFailure.FILE_TOO_LARGE)
                }
            }
        }
        val fileName = name ?: throw StatementException(StatementFailure.INVALID_FILE)
        val input = resolver.openInputStream(uri) ?: throw StatementException(StatementFailure.INVALID_FILE)
        input.use { readStatementFile(fileName, it) }
    }
}

/** Only an opaque job ID is persisted; documents, signed URLs and reviewed financial data stay in memory. */
class PrefsPendingStatementStore(context: Context, userId: String, assistantId: String) : PendingStatementStore {
    private val prefs = context.getSharedPreferences("rin_pending_statements", Context.MODE_PRIVATE)
    private val key = MessageDigest.getInstance("SHA-256")
        .digest("$userId\u0000$assistantId".toByteArray()).joinToString("") { "%02x".format(it) }
    override fun read(): String? = prefs.getString(key, null)
    override fun save(id: String) { check(prefs.edit().putString(key, id).commit()) }
    override fun clear() { prefs.edit().remove(key).apply() }
}
