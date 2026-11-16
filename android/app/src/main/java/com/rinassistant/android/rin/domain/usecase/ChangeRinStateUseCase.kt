package com.rinassistant.android.rin.domain.usecase

import com.rinassistant.android.rin.domain.model.AvatarState
import com.rinassistant.android.rin.overlay.controller.OverlayController
import com.rinassistant.android.rin.overlay.controller.OverlayCommandResult

class ChangeRinStateUseCase(
    private val overlayController: OverlayController,
) {
    fun changeState(state: AvatarState): OverlayCommandResult =
        overlayController.updateAvatarState(state)
}
