package com.rinassistant.android.rin.localtools.focus.distraction

class ConfiguredDistractionPolicy(
    private val preferencesProvider: () -> DistractionAppPreferences,
) : DistractionPolicy {
    override fun classify(packageName: String): AppFocusClassification {
        val normalizedPackage = packageName.trim()
        if (normalizedPackage.isBlank()) {
            return AppFocusClassification.UNKNOWN
        }

        val preferences = preferencesProvider()
        return when (normalizedPackage) {
            in preferences.allowedApps -> AppFocusClassification.ALLOWED
            in preferences.distractingApps -> AppFocusClassification.DISTRACTING
            else -> AppFocusClassification.UNKNOWN
        }
    }
}
