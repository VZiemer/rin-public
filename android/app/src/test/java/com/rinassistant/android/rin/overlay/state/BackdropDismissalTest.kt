package com.rinassistant.android.rin.overlay.state

import com.rinassistant.android.rin.domain.model.*
import com.rinassistant.android.rin.overlay.model.*
import org.junit.Assert.*
import org.junit.Test

class BackdropDismissalTest {
    @Test fun `open panel backdrop closes the panel`() {
        val store = OverlayStateStore(OverlayUiState(mode = OverlayMode.OPEN, isVisible = true))
        assertEquals(BackdropMode.ASSISTANT, store.state.value.backdropMode)

        store.dismissAssistant()

        assertFalse(store.state.value.isVisible)
    }

    @Test fun `focus backdrop never closes focus`() {
        val store = OverlayStateStore(OverlayUiState(mode = OverlayMode.FOCUS, isVisible = true))

        store.dismissAssistant()

        assertEquals(BackdropMode.FOCUS, store.state.value.backdropMode)
        assertEquals(OverlayMode.FOCUS, store.state.value.mode)
    }
}
