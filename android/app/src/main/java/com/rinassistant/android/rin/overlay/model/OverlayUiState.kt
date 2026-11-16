package com.rinassistant.android.rin.overlay.model

import com.rinassistant.android.rin.assistant.AssistantCatalog
import com.rinassistant.android.rin.domain.model.AvatarState
import com.rinassistant.android.rin.domain.model.RinMessage

data class OverlayUiState(
    val isVisible: Boolean = false,
    val mode: OverlayMode = OverlayMode.OPEN,
    val avatarState: AvatarState = AvatarState.NEUTRAL,
    val selectedAssistantId: String = AssistantCatalog.DEFAULT_ID,
    val presentationAssistantId: String? = null,
    val message: RinMessage? = null,
    val pendingMessages: List<RinMessage> = emptyList(),
    val focusPresentation: FocusOverlayPresentation? = null,
) {
    /** The panel always exposes the input field; the focus overlay never does. */
    val inputVisible: Boolean get() = mode == OverlayMode.OPEN

    val backdropMode: BackdropMode get() = when (mode) {
        OverlayMode.OPEN -> BackdropMode.ASSISTANT
        OverlayMode.FOCUS -> BackdropMode.FOCUS
    }

    val visibleAssistantId: String get() = presentationAssistantId ?: selectedAssistantId
}
