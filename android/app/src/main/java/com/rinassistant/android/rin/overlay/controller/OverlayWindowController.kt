package com.rinassistant.android.rin.overlay.controller

import com.rinassistant.android.rin.overlay.model.OverlayUiState

interface OverlayWindowController {
    val isAttached: Boolean

    fun attach(initialState: OverlayUiState)
    fun update(state: OverlayUiState)
    fun detach()
}
