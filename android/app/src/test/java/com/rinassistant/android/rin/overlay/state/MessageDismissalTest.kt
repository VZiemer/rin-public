package com.rinassistant.android.rin.overlay.state

import com.rinassistant.android.rin.domain.model.RinMessage
import com.rinassistant.android.rin.domain.model.RinPriority
import com.rinassistant.android.rin.domain.model.AvatarState
import com.rinassistant.android.rin.overlay.model.OverlayMode
import org.junit.Assert.*
import org.junit.Test

class MessageDismissalTest {
    private val message = RinMessage("one", "Hello", AvatarState.SMUG, RinPriority.NORMAL, emptyList())

    @Test fun `simple message clears on tap and keeps the panel open`() {
        val store = OverlayStateStore()
        store.showMessage(message)
        assertEquals(message, store.state.value.message)

        store.dismissMessageOnTap(message.id)

        assertNull(store.state.value.message)
        assertEquals(AvatarState.NEUTRAL, store.state.value.avatarState)
        assertTrue(store.state.value.isVisible)
        assertEquals(OverlayMode.OPEN, store.state.value.mode)
    }

    @Test fun `required action stays until explicitly cancelled`() {
        val store = OverlayStateStore()
        val required = message.copy(requiresAction = true)
        store.showMessage(required)

        store.dismissMessageOnTap(required.id)
        assertEquals(required, store.state.value.message)

        store.clearMessage()
        assertNull(store.state.value.message)
    }

    @Test fun `stale tap cannot dismiss a replacement message`() {
        val store = OverlayStateStore()
        val replacement = message.copy(id = "two")
        store.showMessage(replacement)

        store.dismissMessageOnTap(message.id)

        assertEquals(replacement, store.state.value.message)
    }

    @Test fun `duplicate dismiss does not reset a later avatar state`() {
        val store = OverlayStateStore()
        store.showMessage(message)
        store.dismissMessageOnTap(message.id)
        store.changeAvatarState(AvatarState.FOCUSED)

        store.dismissMessageOnTap(message.id)

        assertEquals(AvatarState.FOCUSED, store.state.value.avatarState)
    }
}
