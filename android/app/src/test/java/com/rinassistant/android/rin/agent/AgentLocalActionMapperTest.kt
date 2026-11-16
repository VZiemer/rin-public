package com.rinassistant.android.rin.agent

import com.rinassistant.android.rin.domain.model.RinAction
import com.rinassistant.android.rin.localtools.*
import com.rinassistant.android.rin.localtools.focus.*
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test

class AgentLocalActionMapperTest {
    private val mapper = AgentLocalActionMapper()
    @Test fun `only whitelisted tools with valid typed payloads are accepted`() {
        assertEquals(RinAction.StartFocus(25), mapper.map(AgentAction("LOCAL_TOOL", "focus.start", mapOf("minutes" to 25))))
        listOf("25", -1, 0, 25.5, Long.MAX_VALUE).forEach {
            assertNull(mapper.map(AgentAction("LOCAL_TOOL", "focus.start", mapOf("minutes" to it))))
        }
        assertNull(mapper.map(AgentAction("LOCAL_TOOL", "shell.exec", emptyMap())))
        assertNull(mapper.map(AgentAction("CODE", "focus.start", mapOf("minutes" to 25))))
        assertNull(mapper.map(AgentAction("LOCAL_TOOL", "focus.start", mapOf("minutes" to 25, "code" to "bad"))))
    }
    @Test fun `mapping creates a required confirmation without executing tool`() = runBlocking {
        var starts = 0
        val tool = StartFocusTool { starts++ }
        val message = AgentResponseMapper().map(AgentMessageResponse("Start?", "FOCUSED", "NORMAL",
            listOf(AgentAction("LOCAL_TOOL", "focus.start", mapOf("minutes" to 25)))))
        assertTrue(message.requiresAction)
        assertEquals(0, starts)
        LocalActionDispatcher(LocalToolRegistry(listOf(tool))).dispatch<StartFocusSessionInput, Unit>("focus.start", StartFocusSessionInput(25)).getOrThrow()
        assertEquals(1, starts)
    }
}
