package com.rinassistant.android.rin.auth

import java.net.HttpURLConnection
import java.net.URI

class AuthHttp(
    private val auth: AuthRepository,
    private val connect: (URI) -> HttpURLConnection,
) {
    suspend fun open(uri: URI, retry: Boolean = true): HttpURLConnection {
        val session = auth.getSession() ?: throw AuthError.SessionExpired()
        val connection = connect(uri)
        connection.setRequestProperty("Authorization", "Bearer ${session.accessToken}")
        return connection
    }

    suspend fun retryAfterUnauthorized(block: suspend () -> Int): Int {
        val first = block()
        if (first != 401) return first
        runCatching { auth.refreshSession() }.getOrElse { throw AuthError.SessionExpired() }
        return block()
    }
}
