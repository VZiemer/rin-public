package com.rinassistant.android.rin.overlay.controller

import com.rinassistant.android.rin.overlay.model.OverlayUiState

class NoOpOverlayWindowController : OverlayWindowController {
    override val isAttached: Boolean = false

    override fun attach(initialState: OverlayUiState) = Unit

    override fun update(state: OverlayUiState) = Unit

    override fun detach() = Unit
}
