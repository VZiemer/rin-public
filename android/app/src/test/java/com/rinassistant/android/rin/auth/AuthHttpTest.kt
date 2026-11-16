package com.rinassistant.android.rin.auth

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL

class AuthHttpTest {
    private class Connection(private val status: Int) : HttpURLConnection(URL("https://example.test")) {
        var authorization: String? = null
        override fun connect() = Unit
        override fun disconnect() = Unit
        override fun usingProxy() = false
        override fun getResponseCode() = status
        override fun setRequestProperty(key: String?, value: String?) {
            if (key.equals("Authorization", ignoreCase = true)) authorization = value
        }
    }

    @Test
    fun attachesBearerTokenAndRetriesUnauthorizedOnce() = runBlocking {
        val auth = InMemoryAuthRepository(users = mutableMapOf("a@b.c" to "x"))
        auth.signIn("a@b.c", "x")
        val first = Connection(401)
        val second = Connection(200)
        val http = AuthHttp(auth) { if (it.path.contains("retry")) second else first }
        val opened = http.open(URI("https://example.test/agent/message"))
        assertEquals("Bearer access-a@b.c", opened.getRequestProperty("Authorization") ?: first.authorization)
        var calls = 0
        val status = http.retryAfterUnauthorized {
            calls += 1
            if (calls == 1) 401 else 200
        }
        assertEquals(200, status)
        assertEquals(2, calls)
    }
}
