package com.rinassistant.android.rin.overlay

import com.rinassistant.android.rin.overlay.model.*
import com.rinassistant.android.rin.overlay.service.FocusOverlayPolicy
import com.rinassistant.android.rin.localtools.focus.FocusStatus
import org.junit.Assert.*
import org.junit.Test

class FocusOverlayPolicyTest {
    @Test fun `normal assistant never attaches a system overlay`() {
        for (permission in listOf(true, false)) {
            assertFalse(FocusOverlayPolicy.shouldAttach(OverlayUiState(isVisible = true, mode = OverlayMode.OPEN), permission))
        }
    }
    @Test fun `only visible focus with permission and presentation attaches`() {
        val focus = OverlayUiState(isVisible = true, mode = OverlayMode.FOCUS,
            focusPresentation = FocusOverlayPresentation("25:00", FocusStatus.RUNNING, "Focus"))
        assertTrue(FocusOverlayPolicy.shouldAttach(focus, true))
        assertFalse(FocusOverlayPolicy.shouldAttach(focus, false))
        assertFalse(FocusOverlayPolicy.shouldAttach(focus.copy(isVisible = false), true))
        assertFalse(FocusOverlayPolicy.shouldAttach(focus.copy(focusPresentation = null), true))
    }
}
