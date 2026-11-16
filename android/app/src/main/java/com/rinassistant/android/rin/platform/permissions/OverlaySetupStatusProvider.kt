package com.rinassistant.android.rin.platform.permissions

import com.rinassistant.android.rin.overlay.controller.OverlayPermissionController

class OverlaySetupStatusProvider(
    private val overlayPermissionController: OverlayPermissionController,
) {
    fun currentStatus(): OverlaySetupStatus =
        if (overlayPermissionController.canDrawOverlays()) {
            OverlaySetupStatus.CONFIGURED
        } else {
            OverlaySetupStatus.NOT_CONFIGURED
        }
}
