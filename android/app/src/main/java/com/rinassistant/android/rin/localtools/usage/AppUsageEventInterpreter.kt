package com.rinassistant.android.rin.localtools.usage

class AppUsageEventInterpreter {
    fun currentForegroundPackage(events: List<AppUsageEvent>): String? {
        var currentPackage: String? = null
        events.sortedBy { it.eventTimeMillis }.forEach { event ->
            when (event.type) {
                AppUsageEventType.FOREGROUND -> currentPackage = event.packageName
                AppUsageEventType.BACKGROUND -> {
                    if (currentPackage == event.packageName) {
                        currentPackage = null
                    }
                }
                AppUsageEventType.OTHER -> Unit
            }
        }
        return currentPackage
    }
}
