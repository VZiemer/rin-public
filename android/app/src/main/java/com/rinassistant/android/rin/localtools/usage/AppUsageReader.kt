package com.rinassistant.android.rin.localtools.usage

interface AppUsageReader {
    suspend fun getCurrentForegroundPackage(): String?
    suspend fun getRecentUsage(sinceMillis: Long): List<AppUsageEvent>
}
