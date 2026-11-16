package com.rinassistant.android.rin.device

import android.util.Log
import com.rinassistant.android.rin.auth.AuthRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI

class AuthenticatedDeviceRegistrar(
    private val baseUrl: String,
    private val deviceId: String,
    private val auth: AuthRepository,
    private val connect: (URI) -> HttpURLConnection = { it.toURL().openConnection() as HttpURLConnection },
) {
    suspend fun register(pushToken: String) {
        val session = auth.getSession() ?: return
        if (deviceId.isBlank() || pushToken.isBlank()) return
        withContext(Dispatchers.IO) {
            val connection = connect(URI(baseUrl.trimEnd('/') + "/devices/$deviceId"))
            try {
                connection.requestMethod = "PUT"
                connection.connectTimeout = 15_000
                connection.readTimeout = 20_000
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                connection.setRequestProperty("Authorization", "Bearer ${session.accessToken}")
                connection.outputStream.bufferedWriter(Charsets.UTF_8).use {
                    it.write(JSONObject().put("platform", "android").put("pushToken", pushToken).toString())
                }
                val code = connection.responseCode
                if (code !in 200..299) Log.w(TAG, "device_register_failed status=$code")
            } catch (error: IOException) {
                Log.w(TAG, "device_register_offline", error)
            } finally {
                connection.disconnect()
            }
        }
    }

    suspend fun detach() {
        val session = auth.getSession() ?: return
        if (deviceId.isBlank()) return
        withContext(Dispatchers.IO) {
            val connection = connect(URI(baseUrl.trimEnd('/') + "/devices/$deviceId"))
            try {
                connection.requestMethod = "DELETE"
                connection.setRequestProperty("Authorization", "Bearer ${session.accessToken}")
                connection.responseCode
            } catch (error: IOException) {
                Log.w(TAG, "device_detach_offline", error)
            } finally {
                connection.disconnect()
            }
        }
    }

    companion object {
        private const val TAG = "RinDevice"
    }
}
