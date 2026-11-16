package com.rinassistant.android.rin.agent

import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class AgentApiTest {
    @Test fun `request escapes message and sends configured device`() {
        val json = JSONObject(AgentJson.encode(AgentMessageRequest("hello \"Rin\"\n", "my-device")))
        assertEquals("hello \"Rin\"\n", json.getString("message"))
        assertEquals("my-device", json.getString("deviceId"))
        assertEquals("RIN", json.getString("assistantId"))
    }
    @Test fun `response preserves structured local action`() {
        val result = AgentJson.decode("""{"message":"Hi","avatarState":"SMUG","priority":"NORMAL","actions":[{"type":"LOCAL_TOOL","tool":"focus.start","payload":{"minutes":25}}]}""")
        assertEquals("SMUG", result.avatarState)
        assertEquals(25, result.actions.single().payload["minutes"])
    }
    @Test fun `malformed response fails explicitly`() {
        listOf("not json", "{}", "{\"message\":2}", "{\"message\":\"Hi\",\"actions\":2}").forEach {
            try { AgentJson.decode(it); fail("expected failure") }
            catch (error: AgentException) { assertEquals(AgentFailure.MALFORMED_RESPONSE, error.reason) }
        }
    }
    @Test fun `missing configuration does not invoke API`() = runBlocking {
        val repository = AgentRepository(AgentApi { error("must not call") }, "")
        try { repository.send("Hi"); fail("expected failure") }
        catch (error: AgentException) { assertEquals(AgentFailure.NOT_CONFIGURED, error.reason) }
    }
    @Test fun `repository uses configured device and propagates transport errors`() = runBlocking {
        AgentFailure.entries.filter { it != AgentFailure.NOT_CONFIGURED && it != AgentFailure.ASSISTANT_NOT_FOUND }.forEach { failure ->
            val repository = AgentRepository(AgentApi {
                assertEquals(AgentMessageRequest("Hi", "device", "RIN"), it)
                throw AgentException(failure)
            }, "device")
            try { repository.send(" Hi "); fail("expected failure") }
            catch (error: AgentException) { assertEquals(failure, error.reason) }
        }
    }
}
