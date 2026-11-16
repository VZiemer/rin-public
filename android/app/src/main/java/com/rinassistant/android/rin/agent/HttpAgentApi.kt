package com.rinassistant.android.rin.agent

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI
import java.net.SocketTimeoutException
import java.io.IOException

class HttpAgentApi(private val baseUrl: String,
    private val connect: (URI) -> HttpURLConnection = { it.toURL().openConnection() as HttpURLConnection },
    private val accessToken: suspend () -> String? = { null },
    private val refreshOnce: suspend () -> Boolean = { false },
) : AgentApi {
    override suspend fun send(request: AgentMessageRequest): AgentMessageResponse = send(request, retried = false)

    private suspend fun send(request: AgentMessageRequest, retried: Boolean): AgentMessageResponse = withContext(Dispatchers.IO) {
        if (baseUrl.isBlank()) throw AgentException(AgentFailure.NOT_CONFIGURED)
        val uri = try { URI(baseUrl) } catch (_: Exception) { throw AgentException(AgentFailure.NOT_CONFIGURED) }
        if (uri.scheme != "https" || uri.host.isNullOrBlank() || uri.userInfo != null || uri.query != null || uri.fragment != null)
            throw AgentException(AgentFailure.NOT_CONFIGURED)
        val connection = try { connect(URI(baseUrl.trimEnd('/') + "/agent/message")) }
        catch (_: IOException) { throw AgentException(AgentFailure.OFFLINE) }
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = 15_000
            connection.readTimeout = 30_000
            connection.instanceFollowRedirects = false
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            connection.setRequestProperty("Accept", "application/json")
            accessToken()?.let { connection.setRequestProperty("Authorization", "Bearer $it") }
            connection.outputStream.bufferedWriter(Charsets.UTF_8).use { it.write(AgentJson.encode(request)) }
            if (connection.responseCode == 401 && !retried && refreshOnce()) {
                return@withContext send(request, retried = true)
            }
            if (connection.responseCode !in 200..299) {
                val errorBody = runCatching {
                    (connection.errorStream ?: connection.inputStream)
                        ?.bufferedReader(Charsets.UTF_8)
                        ?.readText()
                        .orEmpty()
                }.getOrDefault("")
                if (connection.responseCode == 401) throw AgentException(AgentFailure.UNAUTHENTICATED)
                if (connection.responseCode == 404 && errorBody.contains("ASSISTANT_NOT_FOUND")) {
                    throw AgentException(AgentFailure.ASSISTANT_NOT_FOUND)
                }
                throw AgentException(AgentFailure.BACKEND)
            }
            val text = connection.inputStream.bufferedReader(Charsets.UTF_8).use {
                val buffer = CharArray(1024)
                val body = StringBuilder()
                while (true) {
                    val count = it.read(buffer)
                    if (count < 0) break
                    body.append(buffer, 0, count)
                    if (body.length > 65_536) throw AgentException(AgentFailure.MALFORMED_RESPONSE)
                }
                body.toString()
            }
            AgentJson.decode(text)
        } catch (_: SocketTimeoutException) { throw AgentException(AgentFailure.TIMEOUT) }
        catch (_: IOException) { throw AgentException(AgentFailure.OFFLINE) }
        finally { connection.disconnect() }
    }
}

object AgentJson {
    fun encode(request: AgentMessageRequest): String = JSONObject()
        .put("message", request.message)
        .put("deviceId", request.deviceId)
        .put("assistantId", request.assistantId)
        .toString()

    fun decode(text: String): AgentMessageResponse = try {
        val json = JSONObject(text)
        val message = json.get("message") as? String ?: throw IllegalArgumentException()
        require(message.isNotBlank() && message.length <= 8000)
        val actions = json.optJSONArray("actions")
        require(!json.has("actions") || actions != null)
        require((actions?.length() ?: 0) <= 3)
        AgentMessageResponse(message, json.optString("avatarState", "NEUTRAL"), json.optString("priority", "NORMAL"),
            (0 until (actions?.length() ?: 0)).map { index ->
                val action = requireNotNull(actions).getJSONObject(index)
                val payload = action.optJSONObject("payload") ?: JSONObject()
                AgentAction(action.getString("type"), action.optString("tool", ""),
                    payload.keys().asSequence().associateWith { key -> payload.get(key) })
            },
            json.optString("assistantId", "RIN").ifBlank { "RIN" },
            if (json.has("imageName") && !json.isNull("imageName")) json.get("imageName") as? String
                ?: throw IllegalArgumentException("Invalid imageName") else null,
        )
    } catch (_: Exception) { throw AgentException(AgentFailure.MALFORMED_RESPONSE) }
}
