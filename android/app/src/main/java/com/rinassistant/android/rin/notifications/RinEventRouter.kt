package com.rinassistant.android.rin.notifications

import com.rinassistant.android.rin.domain.model.RinMessage

/** Keeps push delivery policy independent of Android notification and UI APIs. */
class RinEventRouter(
    private val showOverlayMessage: (RinMessage) -> Boolean,
    private val showFallbackNotification: () -> Unit,
) {
    fun route(message: RinMessage) {
        if (!showOverlayMessage(message)) {
            showFallbackNotification()
        }
    }
}
