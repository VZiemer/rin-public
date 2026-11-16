package com.rinassistant.android.rin.notifications

import android.app.KeyguardManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.PowerManager
import android.provider.Settings
import com.rinassistant.android.rin.app.RinApplication
import com.rinassistant.android.rin.localtools.usage.AndroidUsageAccessController
import com.rinassistant.android.rin.overlay.model.OverlayMode

class AndroidPushScreenReader(private val context: Context) {
    fun read(): PushScreenState {
        val app = context.applicationContext as RinApplication
        val interactive = context.getSystemService(PowerManager::class.java).isInteractive
        val locked = context.getSystemService(KeyguardManager::class.java).isKeyguardLocked
        val visible = app.assistantPanelVisible && app.mainWindowFocused
        return PushScreenState(
            interactive = interactive,
            locked = locked,
            assistantVisible = visible,
            homeVisible = interactive && !locked && !visible && isHomeVisible(),
            canOpenFromBackground = Settings.canDrawOverlays(context),
            focusActive = app.appContainer.overlayStateStore.state.value.mode == OverlayMode.FOCUS,
        )
    }

    @Suppress("DEPRECATION")
    private fun isHomeVisible(): Boolean = try {
        if (!AndroidUsageAccessController(context).hasUsageAccess()) false else {
            val home = context.packageManager.resolveActivity(
                Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), PackageManager.MATCH_DEFAULT_ONLY,
            )?.activityInfo?.packageName
            val now = System.currentTimeMillis()
            val events = context.getSystemService(UsageStatsManager::class.java).queryEvents(now - 300_000L, now)
            val event = UsageEvents.Event()
            var foreground: String? = null
            while (events != null && events.hasNextEvent()) {
                events.getNextEvent(event)
                when (event.eventType) {
                    UsageEvents.Event.MOVE_TO_FOREGROUND -> foreground = event.packageName
                    UsageEvents.Event.MOVE_TO_BACKGROUND -> if (foreground == event.packageName) foreground = null
                }
            }
            home != null && home != "android" && home == foreground
        }
    } catch (_: Exception) { false }
}
