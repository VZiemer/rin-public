package com.rinassistant.android.rin.localtools.focus.distraction

data class DistractionAppPreferences(
    val allowedApps: Set<String> = emptySet(),
    val distractingApps: Set<String> = emptySet(),
) {
    init {
        require(allowedApps.none { it.isBlank() }) { "Allowed package names must not be blank." }
        require(distractingApps.none { it.isBlank() }) { "Distracting package names must not be blank." }
    }
}
