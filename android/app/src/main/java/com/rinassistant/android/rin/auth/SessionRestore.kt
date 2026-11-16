package com.rinassistant.android.rin.auth

class SessionRestore(
    private val auth: AuthRepository,
    private val clock: () -> Long = { System.currentTimeMillis() },
) {
    suspend fun restore(): AuthSession? {
        val session = auth.getSession() ?: return null
        if (session.expiresAtEpochMs > clock() + 15_000) return session
        return try {
            auth.refreshSession()
        } catch (_: AuthError.SessionExpired) {
            null
        } catch (_: AuthError.InvalidCredentials) {
            null
        }
    }
}
