package com.rinassistant.android.rin.localtools.focus.distraction

import org.junit.Assert.assertEquals
import org.junit.Test

class DistractionAppPreferencesTest {
    @Test
    fun trimsPackageNames() {
        val preferences = DistractionAppPreferences(
            allowedApps = setOf(" com.allowed "),
            distractingApps = setOf(" com.bad "),
        ).normalized()

        assertEquals(setOf("com.allowed"), preferences.allowedApps)
        assertEquals(setOf("com.bad"), preferences.distractingApps)
    }

    @Test
    fun allowedPackageWinsOverDistractingPackage() {
        val preferences = DistractionAppPreferences(
            allowedApps = setOf("com.app"),
            distractingApps = setOf("com.app", "com.bad"),
        ).normalized()

        assertEquals(setOf("com.app"), preferences.allowedApps)
        assertEquals(setOf("com.bad"), preferences.distractingApps)
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsBlankAllowedPackage() {
        DistractionAppPreferences(allowedApps = setOf(" "))
    }
}
