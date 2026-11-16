package com.rinassistant.android.rin.assistant

import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test

class AssistantAgentActionsTest {
    @Test fun `today submits semantic request and reminder only prefills`() = runBlocking {
        val messages = mutableListOf<String>()
        val input = AssistantInputController { messages.add(it) }
        val actions = AssistantAgentActions(input, "Today's schedule?", "Remind me: ")
        actions.select(AssistantQuickAction.TODAYS_TASKS)
        assertEquals(listOf("Today's schedule?"), messages)
        actions.select(AssistantQuickAction.ADD_REMINDER)
        assertEquals("Remind me: ", input.state.value.text)
        assertEquals(1, messages.size)
    }
    @Test fun `pending send cannot be replaced by quick action`() = runBlocking {
        val gate = CompletableDeferred<Unit>()
        val input = AssistantInputController { gate.await() }
        input.edit("Keep this")
        val job = launch(start = CoroutineStart.UNDISPATCHED) { input.send() }
        AssistantAgentActions(input, "Today?", "Reminder").select(AssistantQuickAction.TODAYS_TASKS)
        assertEquals("Keep this", input.state.value.text)
        gate.complete(Unit); job.join()
    }
}
