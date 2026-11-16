package com.rinassistant.android.rin.auth

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI

class CognitoAuthRepository(
    private val clientId: String,
    private val region: String,
    private val store: SecureSessionStore,
    private val connect: (URI) -> HttpURLConnection = { it.toURL().openConnection() as HttpURLConnection },
    private val clock: () -> Long = { System.currentTimeMillis() },
) : AuthRepository {
    override suspend fun signIn(email: String, password: String): AuthSession {
        val body = JSONObject()
            .put("AuthFlow", "USER_PASSWORD_AUTH")
            .put("ClientId", clientId)
            .put("AuthParameters", JSONObject().put("USERNAME", email).put("PASSWORD", password))
        val json = call("AWSCognitoIdentityProviderService.InitiateAuth", body)
        val result = json.optJSONObject("AuthenticationResult") ?: throw mapError(json)
        val session = sessionFrom(result)
        store.save(session)
        return session
    }

    override suspend fun signUp(email: String, password: String) {
        val body = JSONObject()
            .put("ClientId", clientId)
            .put("Username", email)
            .put("Password", password)
        call("AWSCognitoIdentityProviderService.SignUp", body)
    }

    override suspend fun confirmSignUp(email: String, code: String) {
        val body = JSONObject()
            .put("ClientId", clientId)
            .put("Username", email)
            .put("ConfirmationCode", code)
        call("AWSCognitoIdentityProviderService.ConfirmSignUp", body)
    }

    override suspend fun signOut() {
        store.clear()
    }

    override suspend fun getSession(): AuthSession? = store.read()

    override suspend fun refreshSession(): AuthSession {
        val current = store.read() ?: throw AuthError.SessionExpired()
        if (current.refreshToken.isBlank()) throw AuthError.SessionExpired()
        val body = JSONObject()
            .put("AuthFlow", "REFRESH_TOKEN_AUTH")
            .put("ClientId", clientId)
            .put("AuthParameters", JSONObject().put("REFRESH_TOKEN", current.refreshToken))
        val json = try {
            call("AWSCognitoIdentityProviderService.InitiateAuth", body)
        } catch (_: AuthError.InvalidCredentials) {
            throw AuthError.SessionExpired()
        }
        val result = json.optJSONObject("AuthenticationResult") ?: throw AuthError.Unavailable("invalid_refresh_response")
        val refreshed = sessionFrom(result)
        val session = refreshed.copy(refreshToken = refreshed.refreshToken.ifBlank { current.refreshToken })
        store.save(session)
        return session
    }

    private fun sessionFrom(result: JSONObject): AuthSession {
        val expiresIn = result.optInt("ExpiresIn", 3600)
        return AuthSession(
            accessToken = result.getString("AccessToken"),
            idToken = result.optString("IdToken"),
            refreshToken = result.optString("RefreshToken"),
            expiresAtEpochMs = clock() + expiresIn * 1000L,
        )
    }

    private suspend fun call(target: String, body: JSONObject): JSONObject = withContext(Dispatchers.IO) {
        if (clientId.isBlank() || region.isBlank()) throw AuthError.Unavailable("not_configured")
        val connection = connect(URI("https://cognito-idp.$region.amazonaws.com/"))
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = 15_000
            connection.readTimeout = 20_000
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/x-amz-json-1.1")
            connection.setRequestProperty("X-Amz-Target", target)
            connection.outputStream.bufferedWriter(Charsets.UTF_8).use { it.write(body.toString()) }
            val code = connection.responseCode
            val stream = if (code in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.readText().orEmpty()
            val json = if (text.isBlank()) JSONObject() else JSONObject(text)
            if (code !in 200..299) {
                Log.e(TAG, "cognito_request_failed")
                throw mapError(json)
            }
            json
        } finally {
            connection.disconnect()
        }
    }

    private fun mapError(json: JSONObject): AuthError {
        val type = json.optString("__type")
        val message = json.optString("message").ifBlank { type.ifBlank { "cognito_error" } }
        return when {
            type.contains("NotAuthorized") || type.contains("UserNotFound") -> AuthError.InvalidCredentials()
            type.contains("UserNotConfirmed") -> AuthError.NotConfirmed()
            type.contains("UsernameExists") -> AuthError.Unavailable("Essa conta ja existe. Entre ou confirme o codigo.")
            type.contains("InvalidPassword") -> AuthError.Unavailable("Senha fraca: use pelo menos 8 caracteres, com letra e numero.")
            type.contains("InvalidParameter") -> AuthError.Unavailable(message)
            type.contains("CodeMismatch") || type.contains("ExpiredCode") -> AuthError.Unavailable("Codigo invalido ou expirado.")
            else -> AuthError.Unavailable(message)
        }
    }

    companion object {
        private const val TAG = "RinAuth"
    }
}
