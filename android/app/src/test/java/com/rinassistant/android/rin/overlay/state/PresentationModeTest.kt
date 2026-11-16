package com.rinassistant.android.rin.overlay.state

import com.rinassistant.android.rin.overlay.model.OverlayMode
import com.rinassistant.android.rin.overlay.model.OverlayUiState
import org.junit.Assert.*
import org.junit.Test

class PresentationModeTest {
    @Test fun `show opens the panel with the input visible and hide closes it`() {
        val store = OverlayStateStore()
        assertFalse(store.state.value.isVisible)

        store.show()
        assertEquals(OverlayMode.OPEN, store.state.value.mode)
        assertTrue(store.state.value.isVisible)
        assertTrue(store.state.value.inputVisible)

        store.hide()
        assertFalse(store.state.value.isVisible)
    }

    @Test fun `hide never cancels an active focus overlay`() {
        val store = OverlayStateStore(OverlayUiState(mode = OverlayMode.FOCUS, isVisible = true))

        store.hide()

        assertEquals(OverlayMode.FOCUS, store.state.value.mode)
        assertTrue(store.state.value.isVisible)
    }
}
