package com.rinassistant.android.rin.assistant

import com.rinassistant.android.rin.domain.model.*
import com.rinassistant.android.rin.overlay.state.OverlayStateStore
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test

class AssistantReplyLifecycleTest {
    private val oldReply = RinMessage("old", "Previous answer", AvatarState.NEUTRAL, RinPriority.NORMAL, emptyList())

    @Test fun `send replaces previous reply with thinking until new answer arrives`() = runBlocking {
        val store = OverlayStateStore()
        store.showMessage(oldReply)
        val response = CompletableDeferred<Unit>()
        val next = oldReply.copy(id = "new", text = "New answer")
        val input = AssistantInputController {
            store.clearPreviousReply()
            response.await()
            store.showMessage(next)
        }
        input.edit("Hello")
        val job = launch(start = CoroutineStart.UNDISPATCHED) { input.send() }
        assertTrue(input.state.value.isThinking)
        assertNull(store.state.value.message)
        response.complete(Unit)
        job.join()
        assertFalse(input.state.value.isThinking)
        assertEquals(next, store.state.value.message)
    }

    @Test fun `failure stops thinking without resurrecting old reply or losing draft`() = runBlocking {
        val store = OverlayStateStore()
        store.showMessage(oldReply)
        val input = AssistantInputController { store.clearPreviousReply(); error("offline") }
        input.edit("Hello"); input.send()
        assertNull(store.state.value.message)
        assertTrue(input.state.value.failed)
        assertFalse(input.state.value.isThinking)
        assertEquals("Hello", input.state.value.text)
    }

    @Test fun `blank send does not erase previous answer`() = runBlocking {
        val store = OverlayStateStore()
        store.showMessage(oldReply)
        val input = AssistantInputController { store.clearPreviousReply() }
        input.edit("  "); input.send()
        assertEquals(oldReply, store.state.value.message)
    }
}
