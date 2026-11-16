package com.rinassistant.android.rin.localtools.usage

import android.content.Intent

interface UsageAccessController {
    fun hasUsageAccess(): Boolean
    fun createUsageAccessSettingsIntent(): Intent
}
