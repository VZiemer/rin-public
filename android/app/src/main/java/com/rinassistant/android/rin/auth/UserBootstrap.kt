package com.rinassistant.android.rin.auth

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI

class UserBootstrap(
    private val baseUrl: String,
    private val auth: AuthRepository,
    private val users: UserSessionStore,
    private val connect: (URI) -> HttpURLConnection = { it.toURL().openConnection() as HttpURLConnection },
) {
    suspend fun ensure(): UserSession {
        users.read()?.let { return it }
        val session = auth.getSession() ?: throw AuthError.SessionExpired()
        val created = withContext(Dispatchers.IO) {
            val connection = connect(URI(baseUrl.trimEnd('/') + "/session/bootstrap"))
            try {
                connection.requestMethod = "POST"
                connection.connectTimeout = 15_000
                connection.readTimeout = 20_000
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                connection.setRequestProperty("Authorization", "Bearer ${session.accessToken}")
                connection.outputStream.bufferedWriter(Charsets.UTF_8).use { it.write("{}") }
                val code = connection.responseCode
                if (code !in 200..299) {
                    Log.e(TAG, "bootstrap_failed status=$code")
                    throw AuthError.Unavailable("bootstrap_failed")
                }
                val json = JSONObject(connection.inputStream.bufferedReader(Charsets.UTF_8).readText())
                UserSession(json.getString("userId"), json.optString("defaultAssistantId", "RIN"))
            } finally {
                connection.disconnect()
            }
        }
        users.save(created)
        return created
    }

    companion object {
        private const val TAG = "RinAuth"
    }
}
