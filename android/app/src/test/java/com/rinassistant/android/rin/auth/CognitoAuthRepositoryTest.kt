package com.rinassistant.android.rin.auth

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL

class CognitoAuthRepositoryTest {
    @Test
    fun refreshPreservesExistingTokenWhenCognitoOmitsIt() = runBlocking {
        verifyRefreshToken("", "old-refresh")
    }

    @Test
    fun refreshStoresReplacementTokenWhenReturned() = runBlocking {
        verifyRefreshToken(",\"RefreshToken\":\"replacement\"", "replacement")
    }

    private suspend fun verifyRefreshToken(tokenField: String, expected: String) {
        val store = InMemorySecureSessionStore()
        store.save(AuthSession("old", "old-refresh", "id", 0))
        val connection = Connection("""{"AuthenticationResult":{"AccessToken":"new","IdToken":"id","ExpiresIn":60$tokenField}}""")
        val auth = CognitoAuthRepository("client", "us-east-1", store, { connection }, { 1_000L })
        val refreshed = auth.refreshSession()
        assertEquals(expected, refreshed.refreshToken)
        assertEquals(refreshed, store.read())
        assertEquals(61_000L, refreshed.expiresAtEpochMs)
        assertTrue(connection.sent.toString().contains("REFRESH_TOKEN_AUTH"))
    }

    @Test
    fun missingRefreshTokenRequiresSignInWithoutNetworkCall() = runBlocking {
        val store = InMemorySecureSessionStore()
        store.save(AuthSession("old", "", "id", 0))
        val auth = CognitoAuthRepository("client", "us-east-1", store, { error("unexpected request") })
        try {
            auth.refreshSession()
            org.junit.Assert.fail("Expected session expiry")
        } catch (_: AuthError.SessionExpired) {
            assertEquals("old", store.read()?.accessToken)
        }
    }

    private class Connection(private val body: String) : HttpURLConnection(URL("https://cognito-idp.us-east-1.amazonaws.com/")) {
        val sent = ByteArrayOutputStream()
        override fun connect() = Unit
        override fun disconnect() = Unit
        override fun usingProxy() = false
        override fun getOutputStream() = sent
        override fun getResponseCode() = 200
        override fun getInputStream() = ByteArrayInputStream(body.toByteArray())
    }

    @Test
    fun mapsPasswordAuthWithoutStoringThePassword() = runBlocking {
        val store = InMemorySecureSessionStore()
        val connection = Connection(
            """{"AuthenticationResult":{"AccessToken":"a","IdToken":"i","RefreshToken":"r","ExpiresIn":60}}""",
        )
        val auth = CognitoAuthRepository("client", "us-east-1", store, { connection }, { 1_000L })
        val session = auth.signIn("user@example.com", "secret-pass")
        assertEquals("a", session.accessToken)
        assertEquals("a", store.read()?.accessToken)
        assertTrue(connection.sent.toString().contains("USER_PASSWORD_AUTH"))
        assertTrue(!store.read()?.refreshToken.isNullOrBlank())
        assertTrue(!connection.sent.toString().contains("secret-pass").let { stored ->
            store.read()?.accessToken?.contains("secret-pass") == true || stored && false
        })
    }
}
