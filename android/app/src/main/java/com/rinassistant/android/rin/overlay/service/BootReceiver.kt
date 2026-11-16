package com.rinassistant.android.rin.overlay.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.rinassistant.android.rin.app.RinApplication
import com.rinassistant.android.rin.platform.permissions.OverlaySetupStatus

/**
 * Restores the discreet Rin status-bar icon after a reboot, but only if the user has already
 * granted the "display over other apps" permission (i.e. Rin was previously enabled).
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED &&
            intent.action != Intent.ACTION_LOCKED_BOOT_COMPLETED
        ) {
            return
        }

        val appContainer = (context.applicationContext as RinApplication).appContainer
        if (appContainer.overlaySetupStatusProvider.currentStatus() != OverlaySetupStatus.CONFIGURED) {
            return
        }

        runCatching {
            context.startForegroundService(RinOverlayService.createStartIntent(context))
        }
    }
}
