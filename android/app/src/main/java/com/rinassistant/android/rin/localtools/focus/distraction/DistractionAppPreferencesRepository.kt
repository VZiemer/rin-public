package com.rinassistant.android.rin.localtools.focus.distraction

import kotlinx.coroutines.flow.StateFlow

interface DistractionAppPreferencesRepository {
    val preferences: StateFlow<DistractionAppPreferences>

    suspend fun load()
    suspend fun save(preferences: DistractionAppPreferences)
    suspend fun addAllowedApp(packageName: String)
    suspend fun addDistractingApp(packageName: String)
    suspend fun removeAllowedApp(packageName: String)
    suspend fun removeDistractingApp(packageName: String)
}
