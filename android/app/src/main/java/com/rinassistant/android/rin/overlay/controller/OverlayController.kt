package com.rinassistant.android.rin.overlay.controller

import com.rinassistant.android.rin.domain.model.AvatarState
import com.rinassistant.android.rin.overlay.state.OverlayStateStore

class OverlayController(
    private val overlayPermissionController: OverlayPermissionController,
    private val overlayWindowController: OverlayWindowController,
    private val overlayStateStore: OverlayStateStore,
) {
    fun show(): OverlayCommandResult {
        if (!overlayPermissionController.canDrawOverlays()) {
            return OverlayCommandResult.MISSING_PERMISSION
        }

        if (overlayWindowController.isAttached) {
            return OverlayCommandResult.ALREADY_SHOWN
        }

        overlayStateStore.show()
        overlayWindowController.attach(overlayStateStore.state.value)
        return OverlayCommandResult.SHOWN
    }

    fun updateAvatarState(state: AvatarState): OverlayCommandResult {
        overlayStateStore.changeAvatarState(state)
        if (!overlayStateStore.state.value.isVisible) {
            return OverlayCommandResult.NOT_ACTIVE
        }

        if (overlayWindowController.isAttached) {
            overlayWindowController.update(overlayStateStore.state.value)
        }
        return OverlayCommandResult.UPDATED
    }

    fun hide(): OverlayCommandResult {
        if (!overlayWindowController.isAttached) {
            return OverlayCommandResult.ALREADY_HIDDEN
        }

        overlayStateStore.hide()
        overlayWindowController.detach()
        return OverlayCommandResult.HIDDEN
    }
}
