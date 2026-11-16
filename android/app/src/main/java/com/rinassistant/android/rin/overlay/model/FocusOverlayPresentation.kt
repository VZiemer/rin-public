package com.rinassistant.android.rin.overlay.model

import com.rinassistant.android.rin.localtools.focus.FocusStatus

data class FocusOverlayPresentation(
    val remainingText: String,
    val status: FocusStatus,
    val caption: String,
)
