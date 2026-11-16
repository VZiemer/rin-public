package com.rinassistant.android.rin.localtools.usage

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.os.Build
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class AndroidAppUsageReader(
    context: Context,
    private val interpreter: AppUsageEventInterpreter = AppUsageEventInterpreter(),
    private val clock: () -> Long = System::currentTimeMillis,
) : AppUsageReader {
    private val usageStatsManager = context.getSystemService(UsageStatsManager::class.java)

    override suspend fun getCurrentForegroundPackage(): String? =
        withContext(Dispatchers.Default) {
            val events = getRecentUsage(clock() - FOREGROUND_LOOKBACK_MILLIS)
            interpreter.currentForegroundPackage(events)
        }

    override suspend fun getRecentUsage(sinceMillis: Long): List<AppUsageEvent> =
        withContext(Dispatchers.Default) {
            readUsageEvents(
                sinceMillis = sinceMillis,
                untilMillis = clock(),
            )
        }

    private fun readUsageEvents(
        sinceMillis: Long,
        untilMillis: Long,
    ): List<AppUsageEvent> =
        try {
            val usageEvents = usageStatsManager.queryEvents(sinceMillis, untilMillis)
            buildList {
                val event = UsageEvents.Event()
                while (usageEvents.hasNextEvent()) {
                    usageEvents.getNextEvent(event)
                    add(
                        AppUsageEvent(
                            packageName = event.packageName.orEmpty(),
                            eventTimeMillis = event.timeStamp,
                            type = event.toAppUsageEventType(),
                        ),
                    )
                }
            }
        } catch (_: SecurityException) {
            emptyList()
        }

    private fun UsageEvents.Event.toAppUsageEventType(): AppUsageEventType =
        when (eventType) {
            foregroundEventType() -> AppUsageEventType.FOREGROUND
            backgroundEventType() -> AppUsageEventType.BACKGROUND
            else -> AppUsageEventType.OTHER
        }

    private fun foregroundEventType(): Int =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            UsageEvents.Event.ACTIVITY_RESUMED
        } else {
            @Suppress("DEPRECATION")
            UsageEvents.Event.MOVE_TO_FOREGROUND
        }

    private fun backgroundEventType(): Int =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            UsageEvents.Event.ACTIVITY_PAUSED
        } else {
            @Suppress("DEPRECATION")
            UsageEvents.Event.MOVE_TO_BACKGROUND
        }

    private companion object {
        private const val FOREGROUND_LOOKBACK_MILLIS = 5 * 60 * 1000L
    }
}
