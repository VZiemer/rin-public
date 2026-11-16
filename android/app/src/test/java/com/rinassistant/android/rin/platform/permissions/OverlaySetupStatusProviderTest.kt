package com.rinassistant.android.rin.platform.permissions

import android.content.Intent
import com.rinassistant.android.rin.overlay.controller.OverlayPermissionController
import org.junit.Assert.assertEquals
import org.junit.Test

class OverlaySetupStatusProviderTest {
    @Test
    fun currentStatusIsConfiguredWhenOverlayPermissionIsGranted() {
        val provider = OverlaySetupStatusProvider(
            overlayPermissionController = FakeOverlayPermissionController(canDrawOverlays = true),
        )

        val status = provider.currentStatus()

        assertEquals(OverlaySetupStatus.CONFIGURED, status)
    }

    @Test
    fun currentStatusIsNotConfiguredWhenOverlayPermissionIsDenied() {
        val provider = OverlaySetupStatusProvider(
            overlayPermissionController = FakeOverlayPermissionController(canDrawOverlays = false),
        )

        val status = provider.currentStatus()

        assertEquals(OverlaySetupStatus.NOT_CONFIGURED, status)
    }

    private class FakeOverlayPermissionController(
        private val canDrawOverlays: Boolean,
    ) : OverlayPermissionController {
        override fun canDrawOverlays(): Boolean = canDrawOverlays

        override fun createPermissionIntent(): Intent =
            error("Permission intent is not needed for status tests.")
    }
}
