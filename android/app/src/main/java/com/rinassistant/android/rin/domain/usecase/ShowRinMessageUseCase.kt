package com.rinassistant.android.rin.domain.usecase

import com.rinassistant.android.rin.domain.model.RinMessage
import com.rinassistant.android.rin.overlay.state.OverlayStateStore

class ShowRinMessageUseCase(
    private val overlayStateStore: OverlayStateStore,
) {
    fun showMessage(message: RinMessage) {
        overlayStateStore.showMessage(message)
    }
}
