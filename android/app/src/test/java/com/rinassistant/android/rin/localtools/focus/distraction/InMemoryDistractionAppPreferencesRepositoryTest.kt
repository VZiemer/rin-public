package com.rinassistant.android.rin.localtools.focus.distraction

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test

class InMemoryDistractionAppPreferencesRepositoryTest {
    @Test
    fun addAllowedAppRemovesItFromDistractingApps() = runBlocking {
        val repository = InMemoryDistractionAppPreferencesRepository(
            DistractionAppPreferences(distractingApps = setOf("com.app")),
        )

        repository.addAllowedApp("com.app")

        assertEquals(setOf("com.app"), repository.preferences.value.allowedApps)
        assertEquals(emptySet<String>(), repository.preferences.value.distractingApps)
    }

    @Test
    fun addDistractingAppRemovesItFromAllowedApps() = runBlocking {
        val repository = InMemoryDistractionAppPreferencesRepository(
            DistractionAppPreferences(allowedApps = setOf("com.app")),
        )

        repository.addDistractingApp("com.app")

        assertEquals(emptySet<String>(), repository.preferences.value.allowedApps)
        assertEquals(setOf("com.app"), repository.preferences.value.distractingApps)
    }

    @Test
    fun removePackagesUpdatesMatchingSetOnly() = runBlocking {
        val repository = InMemoryDistractionAppPreferencesRepository(
            DistractionAppPreferences(
                allowedApps = setOf("com.allowed"),
                distractingApps = setOf("com.bad"),
            ),
        )

        repository.removeAllowedApp("com.allowed")
        repository.removeDistractingApp("com.bad")

        assertEquals(DistractionAppPreferences(), repository.preferences.value)
    }
}
