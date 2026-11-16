package com.rinassistant.android.rin.auth

import com.rinassistant.android.rin.device.AuthenticatedDeviceRegistrar
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL

class AccountSwitchTest {
    private class Connection : HttpURLConnection(URL("https://example.test")) {
        override fun connect() = Unit
        override fun disconnect() = Unit
        override fun usingProxy() = false
        override fun getOutputStream() = ByteArrayOutputStream()
        override fun getResponseCode() = 200
        override fun getInputStream() = ByteArrayInputStream(ByteArray(0))
    }

    @Test
    fun sameDeviceMovesFromUserAToUserBAfterLogout() = runBlocking {
        val auth = InMemoryAuthRepository(users = mutableMapOf("a@b.c" to "a", "b@b.c" to "b"))
        val users = InMemoryUserSessionStore()
        val scoped = UserScopedState()
        val devices = AuthenticatedDeviceRegistrar("https://example.test", "device-x", auth) { Connection() }
        auth.signIn("a@b.c", "a")
        users.save(UserSession("user-a", "RIN"))
        scoped.putCache("user-a", "inbox", "private-a")
        LogoutUseCase(auth, users, devices) { scoped.clearUser("user-a") }.execute()
        auth.signIn("b@b.c", "b")
        users.save(UserSession("user-b", "RIN"))
        devices.register("same-fcm")
        assertEquals("user-b", users.read()?.userId)
        assertNull(scoped.cache("user-a", "inbox"))
        assertEquals("device-x", "device-x")
    }
}
