package com.rinassistant.android.rin.localtools.usage

data class AppUsageEvent(
    val packageName: String,
    val eventTimeMillis: Long,
    val type: AppUsageEventType,
)

enum class AppUsageEventType {
    FOREGROUND,
    BACKGROUND,
    OTHER,
}
