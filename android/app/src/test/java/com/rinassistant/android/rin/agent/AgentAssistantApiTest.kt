package com.rinassistant.android.rin.agent

import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.fail
import org.junit.Test

class AgentAssistantApiTest {
    @Test
    fun repositorySendsActiveAssistantIdOnEveryMessage() = runBlocking {
        var captured: AgentMessageRequest? = null
        val repository = AgentRepository(
            api = AgentApi {
                captured = it
                AgentMessageResponse("ok", "NEUTRAL", "NORMAL", emptyList(), it.assistantId)
            },
            deviceId = "device",
            assistantIdProvider = { "YUI" },
        )
        val response = repository.send("tarefas de hoje")
        assertEquals("YUI", captured?.assistantId)
        assertEquals("YUI", response.assistantId)
        assertEquals("YUI", JSONObject(AgentJson.encode(captured!!)).getString("assistantId"))
    }

    @Test
    fun unknownAssistantFromBackendIsACleanFailure() = runBlocking {
        val repository = AgentRepository(
            api = AgentApi { throw AgentException(AgentFailure.ASSISTANT_NOT_FOUND) },
            deviceId = "device",
            assistantIdProvider = { "NOPE" },
        )
        try {
            repository.send("oi")
            fail("expected assistant failure")
        } catch (error: AgentException) {
            assertEquals(AgentFailure.ASSISTANT_NOT_FOUND, error.reason)
        }
    }
}
