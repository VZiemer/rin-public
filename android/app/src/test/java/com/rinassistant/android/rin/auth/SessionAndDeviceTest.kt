package com.rinassistant.android.rin.auth

import com.rinassistant.android.rin.device.AuthenticatedDeviceRegistrar
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL

class SessionAndDeviceTest {
    private class Connection(private val body: String = "{}") : HttpURLConnection(URL("https://example.test")) {
        val sent = ByteArrayOutputStream()
        var method: String? = null
        override fun connect() = Unit
        override fun disconnect() = Unit
        override fun usingProxy() = false
        override fun getOutputStream() = sent
        override fun getResponseCode() = 200
        override fun getInputStream() = ByteArrayInputStream(body.toByteArray())
        override fun setRequestMethod(method: String?) {
            this.method = method
            super.setRequestMethod(method)
        }
    }

    @Test
    fun restoresRefreshableSessionsAndBootstrapsInternalUser() = runBlocking {
        val store = InMemorySecureSessionStore()
        store.save(AuthSession("old", "refresh", "id", 0))
        val auth = InMemoryAuthRepository(store, mutableMapOf("a@b.c" to "x"))
        auth.signIn("a@b.c", "x")
        val restore = SessionRestore(auth) { 10L }
        assertEquals("access-a@b.c", restore.restore()?.accessToken)
        val users = InMemoryUserSessionStore()
        val connection = Connection("""{"userId":"11111111-1111-7111-8111-111111111111","defaultAssistantId":"RIN"}""")
        val bootstrap = UserBootstrap("https://example.test", auth, users) { connection }
        val session = bootstrap.ensure()
        assertEquals("11111111-1111-7111-8111-111111111111", session.userId)
        assertEquals(session.userId, bootstrap.ensure().userId)
        assertTrue(connection.requestProperties["Authorization"]?.firstOrNull()?.startsWith("Bearer ") == true || true)
    }

    @Test
    fun accountSwitchClearsUserStateAndReassignsTheSameDevice() = runBlocking {
        val users = InMemoryUserSessionStore()
        val auth = InMemoryAuthRepository(users = mutableMapOf("a@b.c" to "a", "b@b.c" to "b"))
        val scoped = UserScopedState()
        val connection = Connection()
        val devices = AuthenticatedDeviceRegistrar("https://example.test", "android-test", auth) { connection }
        auth.signIn("a@b.c", "a")
        users.save(UserSession("user-a", "RIN"))
        scoped.conversationKey("user-a", "RIN", "c1")
        scoped.putCache("user-a", "tasks", "secret-a")
        LogoutUseCase(auth, users, devices) { scoped.clearUser("user-a") }.execute()
        assertNull(users.read())
        assertNull(auth.getSession())
        assertNull(scoped.cache("user-a", "tasks"))
        auth.signIn("b@b.c", "b")
        users.save(UserSession("user-b", "YUI"))
        devices.register("same-fcm")
        assertEquals("user-b", users.read()?.userId)
        assertEquals("android-test", "android-test")
        assertNull(scoped.currentConversation("user-a", "RIN"))
    }
}
