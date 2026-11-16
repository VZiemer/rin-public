package com.rinassistant.android.rin.auth

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException

class SessionRestoreTest {
    private val expired = AuthSession("old", "refresh", "id", 0)

    private class Auth(
        var session: AuthSession?,
        val refresh: suspend () -> AuthSession,
    ) : AuthRepository by InMemoryAuthRepository() {
        var refreshCalls = 0
        override suspend fun getSession() = session
        override suspend fun refreshSession(): AuthSession {
            refreshCalls++
            return refresh().also { session = it }
        }
    }

    @Test fun validSessionDoesNotContactCognito() = runBlocking {
        val valid = expired.copy(expiresAtEpochMs = 60_000)
        val auth = Auth(valid) { error("unexpected refresh") }
        assertEquals(valid, SessionRestore(auth) { 1_000 }.restore())
        assertEquals(0, auth.refreshCalls)
    }

    @Test fun expiredAccessTokenIsRefreshed() = runBlocking {
        val refreshed = expired.copy(accessToken = "new", expiresAtEpochMs = 60_000)
        val auth = Auth(expired) { refreshed }
        assertEquals(refreshed, SessionRestore(auth) { 1_000 }.restore())
        assertEquals(1, auth.refreshCalls)
    }

    @Test fun expiredRefreshTokenRequiresSignIn() = runBlocking {
        val auth = Auth(expired) { throw AuthError.SessionExpired() }
        assertNull(SessionRestore(auth) { 1_000 }.restore())
    }

    @Test fun networkFailurePreservesSessionAndAllowsRetry() = runBlocking {
        var offline = true
        val auth = Auth(expired) {
            if (offline) throw IOException("offline")
            expired.copy(accessToken = "new")
        }
        try {
            SessionRestore(auth) { 1_000 }.restore()
            fail("Network failure must reach the retry UI")
        } catch (_: IOException) {
            assertEquals(expired, auth.session)
        }
        offline = false
        assertEquals("new", SessionRestore(auth) { 1_000 }.restore()?.accessToken)
    }

    @Test fun cancellationIsNotConvertedIntoLogout() = runBlocking {
        val cancelled = CancellationException("cancelled")
        val auth = Auth(expired) { throw cancelled }
        try {
            SessionRestore(auth) { 1_000 }.restore()
            fail("Cancellation must propagate")
        } catch (actual: CancellationException) {
            assertSame(cancelled, actual)
        }
    }
}
