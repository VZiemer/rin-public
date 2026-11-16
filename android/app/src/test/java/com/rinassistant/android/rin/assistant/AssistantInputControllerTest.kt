package com.rinassistant.android.rin.assistant

import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test

class AssistantInputControllerTest {
    @Test fun `empty message never submits and success clears text`() = runBlocking {
        val messages = mutableListOf<String>()
        val controller = AssistantInputController { messages.add(it) }
        controller.edit("   "); controller.send()
        assertTrue(messages.isEmpty())
        controller.edit(" hello \nworld "); controller.send()
        assertEquals(listOf("hello \nworld"), messages)
        assertEquals("", controller.state.value.text)
    }
    @Test fun `failure preserves draft and allows retry`() = runBlocking {
        val controller = AssistantInputController { error("offline") }
        controller.edit("hello"); controller.send()
        assertTrue(controller.state.value.failed)
        assertFalse(controller.state.value.submitting)
        assertEquals("hello", controller.state.value.text)
    }
    @Test fun `duplicate sends are ignored while pending`() = runBlocking {
        val gate = CompletableDeferred<Unit>()
        var sends = 0
        val controller = AssistantInputController { sends++; gate.await() }
        controller.edit("hello")
        val job = launch(start = CoroutineStart.UNDISPATCHED) { controller.send() }
        controller.send()
        assertEquals(1, sends)
        gate.complete(Unit); job.join()
        assertFalse(controller.state.value.submitting)
    }
}
