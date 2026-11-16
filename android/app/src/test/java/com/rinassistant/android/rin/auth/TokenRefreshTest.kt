package com.rinassistant.android.rin.auth

import com.rinassistant.android.rin.agent.AgentFailure
import com.rinassistant.android.rin.agent.AgentMessageRequest
import com.rinassistant.android.rin.agent.HttpAgentApi
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL

class TokenRefreshTest {
    private class Connection(status: Int) : HttpURLConnection(URL("https://example.test")) {
        private val code = status
        override fun connect() = Unit
        override fun disconnect() = Unit
        override fun usingProxy() = false
        override fun getOutputStream() = ByteArrayOutputStream()
        override fun getResponseCode() = code
        override fun getInputStream() = ByteArrayInputStream("""{"message":"ok","avatarState":"NEUTRAL","actions":[]}""".toByteArray())
        override fun getErrorStream() = ByteArrayInputStream(ByteArray(0))
    }

    @Test
    fun retriesOnceAfterRefreshAndThenFailsClosed() = runBlocking {
        var refreshes = 0
        val codes = mutableListOf(401, 200)
        val api = HttpAgentApi(
            "https://example.test",
            { Connection(codes.removeAt(0)) },
            accessToken = { "token" },
            refreshOnce = { refreshes += 1; true },
        )
        assertEquals("ok", api.send(AgentMessageRequest("hi", "d")).message)
        assertEquals(1, refreshes)
        val closedCodes = mutableListOf(401, 401)
        val closed = HttpAgentApi(
            "https://example.test",
            { Connection(closedCodes.removeAt(0)) },
            accessToken = { "token" },
            refreshOnce = { true },
        )
        try {
            closed.send(AgentMessageRequest("hi", "d"))
            org.junit.Assert.fail("expected unauthenticated")
        } catch (error: com.rinassistant.android.rin.agent.AgentException) {
            assertEquals(AgentFailure.UNAUTHENTICATED, error.reason)
        }
    }
}
