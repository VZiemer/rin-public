package com.rinassistant.android.rin.auth

data class AuthSession(
    val accessToken: String,
    val refreshToken: String,
    val idToken: String,
    val expiresAtEpochMs: Long,
)

data class UserSession(
    val userId: String,
    val defaultAssistantId: String,
)

sealed class AuthError : Exception() {
    class InvalidCredentials : AuthError()
    class NotConfirmed : AuthError()
    class SessionExpired : AuthError()
    class Unavailable(override val message: String? = null) : AuthError()
}

interface AuthRepository {
    suspend fun signIn(email: String, password: String): AuthSession
    suspend fun signUp(email: String, password: String)
    suspend fun confirmSignUp(email: String, code: String)
    suspend fun signOut()
    suspend fun getSession(): AuthSession?
    suspend fun refreshSession(): AuthSession
}

interface SecureSessionStore {
    fun save(session: AuthSession)
    fun read(): AuthSession?
    fun clear()
}

interface UserSessionStore {
    fun save(session: UserSession)
    fun read(): UserSession?
    fun clear()
}

class InMemorySecureSessionStore : SecureSessionStore {
    private var session: AuthSession? = null
    override fun save(session: AuthSession) {
        this.session = session
    }
    override fun read(): AuthSession? = session
    override fun clear() {
        session = null
    }
}

class InMemoryUserSessionStore : UserSessionStore {
    private var session: UserSession? = null
    override fun save(session: UserSession) {
        this.session = session
    }
    override fun read(): UserSession? = session
    override fun clear() {
        session = null
    }
}

class InMemoryAuthRepository(
    private val store: SecureSessionStore = InMemorySecureSessionStore(),
    private val users: MutableMap<String, String> = mutableMapOf(),
    private val unconfirmed: MutableSet<String> = mutableSetOf(),
) : AuthRepository {
    var signedInEmail: String? = null
        private set

    override suspend fun signIn(email: String, password: String): AuthSession {
        if (email in unconfirmed) throw AuthError.NotConfirmed()
        if (users[email] != password) throw AuthError.InvalidCredentials()
        val session = AuthSession("access-$email", "refresh-$email", "id-$email", Long.MAX_VALUE)
        store.save(session)
        signedInEmail = email
        return session
    }

    override suspend fun signUp(email: String, password: String) {
        users[email] = password
        unconfirmed += email
    }

    override suspend fun confirmSignUp(email: String, code: String) {
        if (code.isBlank()) throw AuthError.Unavailable("invalid_code")
        unconfirmed -= email
    }

    override suspend fun signOut() {
        store.clear()
        signedInEmail = null
    }

    override suspend fun getSession(): AuthSession? = store.read()

    override suspend fun refreshSession(): AuthSession {
        val current = store.read() ?: throw AuthError.SessionExpired()
        val refreshed = current.copy(accessToken = current.accessToken + "-refreshed")
        store.save(refreshed)
        return refreshed
    }
}
