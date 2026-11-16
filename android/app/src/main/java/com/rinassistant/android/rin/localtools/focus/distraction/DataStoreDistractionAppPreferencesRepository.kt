package com.rinassistant.android.rin.localtools.focus.distraction

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first

private val Context.distractionAppPreferencesDataStore by preferencesDataStore(
    name = "distraction_app_preferences",
)

class DataStoreDistractionAppPreferencesRepository(
    private val context: Context,
) : DistractionAppPreferencesRepository {
    private val mutablePreferences = MutableStateFlow(DistractionAppPreferences())
    override val preferences: StateFlow<DistractionAppPreferences> = mutablePreferences.asStateFlow()

    override suspend fun load() {
        val preferences = context.distractionAppPreferencesDataStore.data.first()
        mutablePreferences.value = DistractionAppPreferences(
            allowedApps = preferences[ALLOWED_APPS].orEmpty(),
            distractingApps = preferences[DISTRACTING_APPS].orEmpty(),
        ).normalized()
    }

    override suspend fun save(preferences: DistractionAppPreferences) {
        val normalizedPreferences = preferences.normalized()
        context.distractionAppPreferencesDataStore.edit { storedPreferences ->
            storedPreferences[ALLOWED_APPS] = normalizedPreferences.allowedApps
            storedPreferences[DISTRACTING_APPS] = normalizedPreferences.distractingApps
        }
        mutablePreferences.value = normalizedPreferences
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

    private companion object {
        val ALLOWED_APPS = stringSetPreferencesKey("allowed_apps")
        val DISTRACTING_APPS = stringSetPreferencesKey("distracting_apps")
    }
}
