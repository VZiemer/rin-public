package com.rinassistant.android.rin.overlay.state

import com.rinassistant.android.rin.domain.model.AvatarState
import com.rinassistant.android.rin.domain.model.RinMessage
import com.rinassistant.android.rin.domain.model.RinPriority
import com.rinassistant.android.rin.localtools.focus.FocusStatus
import com.rinassistant.android.rin.overlay.model.FocusOverlayPresentation
import com.rinassistant.android.rin.overlay.model.OverlayMode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class OverlayStateStoreTest {
    private fun message(id: String = "debug") = RinMessage(
        id = id,
        text = "Meeting soon.",
        avatarState = AvatarState.SCOLDING,
        priority = RinPriority.HIGH,
        actions = emptyList(),
    )

    @Test
    fun showOpensPanel() {
        val store = OverlayStateStore()

        store.show()

        assertTrue(store.state.value.isVisible)
        assertEquals(OverlayMode.OPEN, store.state.value.mode)
    }

    @Test
    fun hideClosesPanel() {
        val store = OverlayStateStore()
        store.show()

        store.hide()

        assertFalse(store.state.value.isVisible)
    }

    @Test
    fun hideClearsMessage() {
        val store = OverlayStateStore()
        store.showMessage(message())

        store.hide()

        assertFalse(store.state.value.isVisible)
        assertEquals(null, store.state.value.message)
    }

    @Test
    fun changeAvatarStateKeepsSelectedState() {
        val store = OverlayStateStore()

        store.changeAvatarState(AvatarState.FOCUSED)

        assertEquals(AvatarState.FOCUSED, store.state.value.avatarState)
    }

    @Test
    fun showMessageOpensPanelWithMessageAndAvatarState() {
        val store = OverlayStateStore()
        val message = message()

        store.showMessage(message)

        assertTrue(store.state.value.isVisible)
        assertEquals(OverlayMode.OPEN, store.state.value.mode)
        assertEquals(message, store.state.value.message)
        assertEquals(AvatarState.SCOLDING, store.state.value.avatarState)
    }

    @Test
    fun clearMessageRemovesMessageButKeepsPanelOpen() {
        val store = OverlayStateStore()
        store.showMessage(message())

        store.clearMessage()

        assertEquals(null, store.state.value.message)
        assertEquals(OverlayMode.OPEN, store.state.value.mode)
        assertTrue(store.state.value.isVisible)
    }

    @Test
    fun showFocusPresentationUpdatesFocusOverlayState() {
        val store = OverlayStateStore()
        val presentation = FocusOverlayPresentation(
            remainingText = "24:32",
            status = FocusStatus.RUNNING,
            caption = "Focus.",
        )

        store.showFocusPresentation(presentation = presentation, avatarState = AvatarState.FOCUSED)

        assertTrue(store.state.value.isVisible)
        assertEquals(OverlayMode.FOCUS, store.state.value.mode)
        assertEquals(presentation, store.state.value.focusPresentation)
        assertEquals(AvatarState.FOCUSED, store.state.value.avatarState)
        assertEquals(null, store.state.value.message)
    }

    @Test
    fun clearFocusPresentationReturnsToClosedPanel() {
        val store = OverlayStateStore()
        store.showFocusPresentation(
            presentation = FocusOverlayPresentation(
                remainingText = "24:32",
                status = FocusStatus.RUNNING,
                caption = "Focus.",
            ),
            avatarState = AvatarState.FOCUSED,
        )

        store.clearFocusPresentation()

        assertEquals(OverlayMode.OPEN, store.state.value.mode)
        assertFalse(store.state.value.isVisible)
        assertEquals(null, store.state.value.focusPresentation)
    }

    @Test
    fun clearFocusPresentationSurfacesQueuedMessage() {
        val store = OverlayStateStore()
        store.showFocusPresentation(
            presentation = FocusOverlayPresentation("24:32", FocusStatus.RUNNING, "Focus."),
            avatarState = AvatarState.FOCUSED,
        )
        store.showMessage(message("queued"))

        store.clearFocusPresentation()

        assertEquals(OverlayMode.OPEN, store.state.value.mode)
        assertTrue(store.state.value.isVisible)
        assertEquals("queued", store.state.value.message?.id)
    }
}
