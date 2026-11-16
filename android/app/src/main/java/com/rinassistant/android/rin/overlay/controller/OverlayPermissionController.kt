package com.rinassistant.android.rin.overlay.controller

import android.content.Intent

interface OverlayPermissionController {
    fun canDrawOverlays(): Boolean
    fun createPermissionIntent(): Intent
}
