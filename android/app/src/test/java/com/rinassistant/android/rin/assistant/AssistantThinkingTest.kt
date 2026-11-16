package com.rinassistant.android.rin.assistant

import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test

class AssistantThinkingTest {
    @Test fun `thinking ends on success failure and cancellation`() = runBlocking {
        for (outcome in listOf("success", "failure", "cancel")) {
            val gate = CompletableDeferred<Unit>()
            val controller = AssistantInputController { gate.await(); if (outcome == "failure") error("offline") }
            controller.edit("Hello")
            val job = launch(start = CoroutineStart.UNDISPATCHED) { controller.send() }
            assertTrue(controller.state.value.isThinking)
            if (outcome == "cancel") job.cancel() else gate.complete(Unit)
            job.join()
            assertFalse(controller.state.value.isThinking)
        }
    }
}
