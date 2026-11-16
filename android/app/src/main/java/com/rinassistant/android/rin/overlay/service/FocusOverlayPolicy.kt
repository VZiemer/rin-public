package com.rinassistant.android.rin.overlay.service

import com.rinassistant.android.rin.overlay.model.OverlayMode
import com.rinassistant.android.rin.overlay.model.OverlayUiState

object FocusOverlayPolicy {
    fun shouldAttach(state: OverlayUiState, permissionGranted: Boolean): Boolean =
        state.isVisible && state.mode == OverlayMode.FOCUS && state.focusPresentation != null && permissionGranted
}
