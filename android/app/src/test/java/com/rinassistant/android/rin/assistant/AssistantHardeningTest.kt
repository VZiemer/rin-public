package com.rinassistant.android.rin.assistant

import com.rinassistant.android.rin.domain.model.*
import com.rinassistant.android.rin.overlay.model.*
import com.rinassistant.android.rin.overlay.state.OverlayStateStore
import com.rinassistant.android.rin.localtools.focus.FocusStatus
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test

class AssistantHardeningTest {
    private val message = RinMessage("push", "Hello", AvatarState.SMUG, RinPriority.NORMAL, emptyList())
    @Test fun `push waits during focus and appears after focus ends`() {
        val store = OverlayStateStore()
        val focus = FocusOverlayPresentation("25:00", FocusStatus.RUNNING, "Focus")
        store.showFocusPresentation(focus, AvatarState.FOCUSED)
        store.showMessage(message)
        store.showMessage(message)
        store.showFocusPresentation(focus.copy(remainingText = "24:59"), AvatarState.FOCUSED)
        assertEquals(OverlayMode.FOCUS, store.state.value.mode)
        assertNull(store.state.value.message)
        assertEquals(listOf(message), store.state.value.pendingMessages)
        store.clearFocusPresentation()
        assertEquals(message, store.state.value.message)
        assertEquals(OverlayMode.OPEN, store.state.value.mode)
        store.clearFocusPresentation()
        assertEquals(message, store.state.value.message)
    }
    @Test fun `incoming message cannot replace a required confirmation`() {
        val store = OverlayStateStore()
        val confirmation = message.copy(id = "confirm", requiresAction = true)
        store.showMessage(confirmation); store.showMessage(message)
        assertEquals(confirmation, store.state.value.message)
        store.clearMessage()
        assertEquals(message, store.state.value.message)
    }
    @Test fun `duplicate and stale action clicks cannot execute twice`() = runBlocking {
        val store = OverlayStateStore()
        store.showMessage(message)
        val gate = CompletableDeferred<Unit>()
        var calls = 0
        val controller = MessageActionController(store) { calls++; gate.await(); store.clearMessage() }
        val job = launch(start = CoroutineStart.UNDISPATCHED) { controller.select(message.id, RinAction.Dismiss) }
        assertFalse(controller.select(message.id, RinAction.Dismiss))
        gate.complete(Unit); job.join()
        assertFalse(controller.select(message.id, RinAction.Dismiss))
        assertEquals(1, calls)
    }
    @Test fun `tool failure leaves confirmation available for retry`() = runBlocking {
        val store = OverlayStateStore()
        store.showMessage(message.copy(requiresAction = true))
        var calls = 0
        val controller = MessageActionController(store) { calls++; error("tool unavailable") }
        repeat(2) { runCatching { controller.select(message.id, RinAction.Dismiss) } }
        assertEquals(2, calls)
        assertNotNull(store.state.value.message)
    }
    @Test fun `fresh process begins idle without replaying sends or confirmations`() {
        assertFalse(OverlayStateStore().state.value.isVisible)
        assertFalse(AssistantInputController {}.state.value.isThinking)
    }
}
