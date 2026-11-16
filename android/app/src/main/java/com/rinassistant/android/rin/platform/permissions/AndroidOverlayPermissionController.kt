package com.rinassistant.android.rin.platform.permissions

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import com.rinassistant.android.rin.overlay.controller.OverlayPermissionController

class AndroidOverlayPermissionController(
    private val context: Context,
) : OverlayPermissionController {
    override fun canDrawOverlays(): Boolean = Settings.canDrawOverlays(context)

    override fun createPermissionIntent(): Intent =
        Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:${context.packageName}"),
        )
}
