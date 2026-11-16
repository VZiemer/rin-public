package com.rinassistant.android.rin.agent

import java.net.HttpURLConnection
import java.net.URL
import java.net.SocketTimeoutException
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test

class HttpAgentApiTest {
    private class Connection(private val status: Int = 200, private val failure: IOException? = null) : HttpURLConnection(URL("https://example.test")) {
        val sent = ByteArrayOutputStream()
        var closed = false
        override fun connect() = Unit
        override fun disconnect() { closed = true }
        override fun usingProxy() = false
        override fun getOutputStream() = sent
        override fun getResponseCode(): Int { failure?.let { throw it }; return status }
        override fun getInputStream() = ByteArrayInputStream("""{"message":"Hello","avatarState":"SMUG","actions":[]}""".toByteArray())
    }
    @Test fun `transport posts JSON to endpoint and always disconnects`() = runBlocking {
        val connection = Connection()
        val result = HttpAgentApi("https://example.test/api/", connect = {
            assertEquals("https://example.test/api/agent/message", it.toString()); connection
        }).send(AgentMessageRequest("Hello", "device"))
        assertEquals("Hello", result.message)
        assertEquals("POST", connection.requestMethod)
        assertTrue(connection.sent.toString().contains("deviceId"))
        assertEquals(15_000, connection.connectTimeout)
        assertEquals(30_000, connection.readTimeout)
        assertFalse(connection.instanceFollowRedirects)
        assertTrue(connection.closed)
    }
    @Test fun `transport distinguishes backend timeout and offline failures`() = runBlocking {
        listOf(Connection(500) to AgentFailure.BACKEND,
            Connection(failure = SocketTimeoutException()) to AgentFailure.TIMEOUT,
            Connection(failure = IOException()) to AgentFailure.OFFLINE).forEach { (connection, expected) ->
            try { HttpAgentApi("https://example.test", connect = { connection }).send(AgentMessageRequest("Hi", "device")); fail() }
            catch (error: AgentException) { assertEquals(expected, error.reason) }
            assertTrue(connection.closed)
        }
    }
    @Test fun `missing and insecure configuration never opens a connection`() = runBlocking {
        listOf("", "http://example.test", "https://user@example.test").forEach { url ->
            try { HttpAgentApi(url, connect = { error("must not connect") }).send(AgentMessageRequest("Hi", "device")); fail() }
            catch (error: AgentException) { assertEquals(AgentFailure.NOT_CONFIGURED, error.reason) }
        }
    }
}
