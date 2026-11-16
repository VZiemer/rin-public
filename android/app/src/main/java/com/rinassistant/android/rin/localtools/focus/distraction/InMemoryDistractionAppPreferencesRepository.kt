package com.rinassistant.android.rin.localtools.focus.distraction

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class InMemoryDistractionAppPreferencesRepository(
    initialPreferences: DistractionAppPreferences = DistractionAppPreferences(),
) : DistractionAppPreferencesRepository {
    private val mutablePreferences = MutableStateFlow(initialPreferences)
    override val preferences: StateFlow<DistractionAppPreferences> = mutablePreferences.asStateFlow()

    override suspend fun load() = Unit

    override suspend fun save(preferences: DistractionAppPreferences) {
        mutablePreferences.value = preferences.normalized()
    }

    override suspend fun addAllowedApp(packageName: String) {
        val normalizedPackage = packageName.normalizedPackageName()
        save(
            preferences.value.copy(
                allowedApps = preferences.value.allowedApps + normalizedPackage,
                distractingApps = preferences.value.distractingApps - normalizedPackage,
            ),
        )
    }

    override suspend fun addDistractingApp(packageName: String) {
        val normalizedPackage = packageName.normalizedPackageName()
        save(
            preferences.value.copy(
                allowedApps = preferences.value.allowedApps - normalizedPackage,
                distractingApps = preferences.value.distractingApps + normalizedPackage,
            ),
        )
    }

    override suspend fun removeAllowedApp(packageName: String) {
        save(
            preferences.value.copy(
                allowedApps = preferences.value.allowedApps - packageName.normalizedPackageName(),
            ),
        )
    }

    override suspend fun removeDistractingApp(packageName: String) {
        save(
            preferences.value.copy(
                distractingApps = preferences.value.distractingApps - packageName.normalizedPackageName(),
            ),
        )
    }
}
