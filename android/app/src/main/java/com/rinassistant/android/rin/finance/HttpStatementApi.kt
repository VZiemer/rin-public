package com.rinassistant.android.rin.finance

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URI

class HttpStatementApi(
    private val baseUrl: String,
    private val accessToken: suspend () -> String?,
    private val refreshOnce: suspend () -> Boolean,
    private val connect: (URI) -> HttpURLConnection = { it.toURL().openConnection() as HttpURLConnection },
) : StatementApi {
    override suspend fun create(assistantId: String, file: StatementFile, accountId: String, sourceKind: String): StatementUpload {
        val json = request(assistantId, "statements", "POST", JSONObject()
            .put("format", file.format).put("accountId", accountId).put("sourceKind", sourceKind)
            .put("sizeBytes", file.bytes.size).put("sha256", file.sha256).put("consentToAnalysis", true))
        return decode {
            val headers = json.getJSONObject("headers")
            StatementUpload(validId(json.getString("id")), json.getString("url"),
                headers.keys().asSequence().associateWith { headers.getString(it) })
        }
    }

    override suspend fun upload(ticket: StatementUpload, bytes: ByteArray) = withContext(Dispatchers.IO) {
        val uri = secureUri(ticket.url, StatementFailure.MALFORMED_RESPONSE, allowQuery = true)
        transport {
            val connection = connect(uri)
            try {
                configure(connection)
                connection.requestMethod = "PUT"
                connection.doOutput = true
                connection.setFixedLengthStreamingMode(bytes.size)
                ticket.headers.forEach { (key, value) ->
                    // The signed PUT has its own credentials; never forward the app's JWT.
                    if (key.equals("authorization", true) || key.equals("cookie", true) ||
                        key.contains('\r') || key.contains('\n') || value.contains('\r') || value.contains('\n')) {
                        throw StatementException(StatementFailure.MALFORMED_RESPONSE)
                    }
                    connection.setRequestProperty(key, value)
                }
                connection.outputStream.use { it.write(bytes) }
                if (connection.responseCode !in 200..299) throw StatementException(StatementFailure.UPLOAD_FAILED)
            } finally { connection.disconnect() }
        }
    }

    override suspend fun get(assistantId: String, id: String): StatementJob = decode {
        StatementJson.job(request(assistantId, "statements/${validId(id)}", "GET")).also { require(it.id == id) }
    }

    override suspend fun commit(assistantId: String, id: String, revision: Long, rows: List<StatementRow>) {
        val result = request(assistantId, "statements/${validId(id)}/commit", "POST", StatementJson.commit(revision, rows))
        decode { require(result.getString("status") == "committed") }
    }

    private suspend fun request(assistantId: String, path: String, method: String, body: JSONObject? = null): JSONObject {
        if (!Regex("[A-Za-z0-9_-]{1,80}").matches(assistantId)) throw StatementException(StatementFailure.INVALID_INPUT)
        secureUri(baseUrl, StatementFailure.NOT_CONFIGURED)
        val uri = URI(baseUrl.trimEnd('/') + "/assistants/$assistantId/finance/$path")
        repeat(2) { attempt ->
            val token = accessToken()?.takeIf { it.isNotBlank() } ?: throw StatementException(StatementFailure.UNAUTHENTICATED)
            val (status, text) = withContext(Dispatchers.IO) {
                transport {
                    val connection = connect(uri)
                    try {
                        configure(connection)
                        connection.requestMethod = method
                        connection.setRequestProperty("Accept", "application/json")
                        connection.setRequestProperty("Authorization", "Bearer $token")
                        if (body != null) {
                            connection.doOutput = true
                            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                            connection.outputStream.bufferedWriter(Charsets.UTF_8).use { it.write(body.toString()) }
                        }
                        val code = connection.responseCode
                        // Only a whitelisted error code leaves this adapter; never expose raw bodies.
                        code to when {
                            code in 200..299 -> readBody(connection.inputStream, 262_144)
                            code == 404 -> missingResourceCode(connection)
                            else -> ""
                        }
                    } finally { connection.disconnect() }
                }
            }
            if (status == 401 && attempt == 0 && refreshOnce()) return@repeat
            if (status !in 200..299) throw StatementException(when (status) {
                401, 403 -> StatementFailure.UNAUTHENTICATED
                404 -> when (text) {
                    "STATEMENT_NOT_FOUND" -> StatementFailure.NOT_FOUND
                    "ASSISTANT_NOT_FOUND" -> StatementFailure.ASSISTANT_UNAVAILABLE
                    else -> StatementFailure.ROUTE_NOT_FOUND
                }
                409 -> StatementFailure.CONFLICT
                400, 413, 422 -> StatementFailure.INVALID_INPUT
                503 -> StatementFailure.UNAVAILABLE
                else -> StatementFailure.BACKEND
            })
            return decode { JSONObject(text) }
        }
        throw StatementException(StatementFailure.UNAUTHENTICATED)
    }

    private fun configure(connection: HttpURLConnection) {
        connection.connectTimeout = 15_000
        connection.readTimeout = 30_000
        connection.instanceFollowRedirects = false
    }

    private fun readBody(stream: InputStream, limit: Int): String = stream.bufferedReader(Charsets.UTF_8).use { reader ->
        val body = StringBuilder()
        val buffer = CharArray(8192)
        while (true) {
            val count = reader.read(buffer)
            if (count < 0) break
            body.append(buffer, 0, count)
            if (body.length > limit) throw StatementException(StatementFailure.MALFORMED_RESPONSE)
        }
        body.toString()
    }

    private fun missingResourceCode(connection: HttpURLConnection): String {
        val stream = connection.errorStream ?: return ""
        val code = try {
            JSONObject(readBody(stream, 8192)).optString("code").uppercase(java.util.Locale.ROOT)
        } catch (_: Exception) { return "" }
        return code.takeIf { it in setOf("STATEMENT_NOT_FOUND", "ASSISTANT_NOT_FOUND") }.orEmpty()
    }

    private inline fun <T> transport(block: () -> T): T = try { block() }
        catch (_: SocketTimeoutException) { throw StatementException(StatementFailure.TIMEOUT) }
        catch (_: IOException) { throw StatementException(StatementFailure.OFFLINE) }

    private fun secureUri(value: String, failure: StatementFailure, allowQuery: Boolean = false): URI {
        val uri = try { URI(value) } catch (_: Exception) { throw StatementException(failure) }
        if (uri.scheme != "https" || uri.host.isNullOrBlank() || uri.userInfo != null || uri.fragment != null ||
            (!allowQuery && uri.query != null)) throw StatementException(failure)
        return uri
    }
}

private fun validId(value: String): String {
    require(Regex("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}").matches(value))
    return value
}

private suspend inline fun <T> decode(block: () -> T): T = try { block() }
    catch (error: StatementException) { throw error }
    catch (error: kotlinx.coroutines.CancellationException) { throw error }
    catch (_: Exception) { throw StatementException(StatementFailure.MALFORMED_RESPONSE) }

object StatementJson {
    fun row(row: StatementRow): JSONObject = JSONObject()
        .put("occurredOn", row.occurredOn).put("description", row.description).put("amountMinor", row.amountMinor)
        .put("currency", "BRL").put("kind", row.kind.wire).put("category", row.category)
        .put("externalId", row.externalId ?: JSONObject.NULL)

    fun commit(revision: Long, rows: List<StatementRow>): JSONObject = JSONObject()
        .put("revision", revision).put("confirmed", true).put("duplicateReviewConfirmed", true)
        .put("rows", JSONArray(rows.map(::row)))

    fun job(json: JSONObject): StatementJob {
        val preview = json.optJSONObject("preview")
        if (preview != null) {
            require(preview.getBoolean("complete"))
            require(preview.getJSONArray("rows").length() in 1..MAX_STATEMENT_ROWS)
        }
        val status = StatementStatus.fromWire(json.getString("status"))
        if (status == StatementStatus.REVIEW) require(preview != null)
        val revision = integer(json, "revision").also { require(it >= 0) }
        val rows = rows(preview?.optJSONArray("rows"))
        val reviewed = json.optJSONArray("reviewedRows")?.let(::rows)
        if (status == StatementStatus.COMMITTING) {
            require(reviewed != null && reviewed.all { StatementRowDraft.from(it, 0).toRow() != null })
        }
        require(validStatementAccount(json.getString("accountId")))
        require(json.getString("sourceKind") in setOf("bank", "card"))
        val duplicates = json.optJSONArray("potentialDuplicates")
        return StatementJob(validId(json.getString("id")), revision, status,
            json.getString("accountId"), json.getString("sourceKind"), rows, reviewed,
            preview?.optJSONArray("warnings")?.let { array -> (0 until array.length()).map { array.getString(it) } } ?: emptyList(),
            duplicates?.let { array -> (0 until array.length()).map { array.getInt(it).also { index -> require(index in rows.indices) } }.toSet() } ?: emptySet(),
            if (json.isNull("errorCode")) null else json.optString("errorCode").takeIf { it.isNotBlank() },
        )
    }

    private fun rows(array: JSONArray?): List<StatementRow> {
        if (array == null) return emptyList()
        require(array.length() <= MAX_STATEMENT_ROWS)
        return (0 until array.length()).map { index ->
            val row = array.getJSONObject(index)
            require(row.getString("currency") == "BRL")
            val amount = integer(row, "amountMinor").also { require(it in 1..1_000_000_000_000L) }
            StatementRow(row.getString("occurredOn"), row.getString("description"), amount,
                StatementKind.fromWire(row.getString("kind")), row.getString("category"),
                if (row.isNull("externalId")) null else row.getString("externalId").also { require(it.length in 1..120) })
        }
    }

    private fun integer(json: JSONObject, key: String): Long {
        val value = json.get(key)
        require(value is Number)
        return java.math.BigDecimal(value.toString()).longValueExact()
    }
}
