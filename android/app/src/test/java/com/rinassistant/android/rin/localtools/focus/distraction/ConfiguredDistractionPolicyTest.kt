package com.rinassistant.android.rin.localtools.focus.distraction

import org.junit.Assert.assertEquals
import org.junit.Test

class ConfiguredDistractionPolicyTest {
    @Test
    fun classifiesAllowedPackage() {
        val policy = policy(
            DistractionAppPreferences(
                allowedApps = setOf("com.allowed"),
            ),
        )

        assertEquals(AppFocusClassification.ALLOWED, policy.classify("com.allowed"))
    }

    @Test
    fun classifiesDistractingPackage() {
        val policy = policy(
            DistractionAppPreferences(
                distractingApps = setOf("com.bad"),
            ),
        )

        assertEquals(AppFocusClassification.DISTRACTING, policy.classify("com.bad"))
    }

    @Test
    fun classifiesUnknownPackage() {
        assertEquals(AppFocusClassification.UNKNOWN, policy(DistractionAppPreferences()).classify("com.other"))
    }

    @Test
    fun classifiesBlankPackageAsUnknown() {
        assertEquals(AppFocusClassification.UNKNOWN, policy(DistractionAppPreferences()).classify(" "))
    }

    private fun policy(preferences: DistractionAppPreferences): ConfiguredDistractionPolicy =
        ConfiguredDistractionPolicy { preferences }
}
