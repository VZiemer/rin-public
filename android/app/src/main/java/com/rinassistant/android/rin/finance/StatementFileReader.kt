package com.rinassistant.android.rin.finance

import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.security.MessageDigest

/** Enforces the limit while streaming, including providers with missing or incorrect SIZE metadata. */
fun readStatementFile(name: String, input: InputStream): StatementFile {
    val format = name.substringAfterLast('.', "").lowercase(java.util.Locale.ROOT)
    if (format != "csv") throw StatementException(StatementFailure.INVALID_FILE)
    val output = ByteArrayOutputStream()
    val buffer = ByteArray(8192)
    while (true) {
        val count = input.read(buffer)
        if (count < 0) break
        if (output.size() + count > MAX_STATEMENT_BYTES) throw StatementException(StatementFailure.FILE_TOO_LARGE)
        output.write(buffer, 0, count)
    }
    val bytes = output.toByteArray()
    if (bytes.isEmpty()) {
        throw StatementException(StatementFailure.INVALID_FILE)
    }
    val hash = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
    return StatementFile(name, format, bytes, hash)
}
