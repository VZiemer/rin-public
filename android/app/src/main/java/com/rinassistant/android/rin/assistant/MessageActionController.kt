package com.rinassistant.android.rin.assistant

import com.rinassistant.android.rin.domain.model.RinAction
import com.rinassistant.android.rin.overlay.state.OverlayStateStore

class MessageActionController(private val store: OverlayStateStore, private val handle: suspend (RinAction) -> Unit) {
    private var busy = false
    suspend fun select(messageId: String, action: RinAction): Boolean {
        val message = store.state.value.message ?: return false
        if (busy || message.id != messageId || (action != RinAction.Dismiss && message.actions.none { it.action == action })) return false
        busy = true
        try { handle(action); return true } finally { busy = false }
    }
}
