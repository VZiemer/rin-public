package com.rinassistant.android.rin.localtools.focus.distraction

fun String.normalizedPackageName(): String {
    val normalized = trim()
    require(normalized.isNotBlank()) { "Package name must not be blank." }
    return normalized
}

fun DistractionAppPreferences.normalized(): DistractionAppPreferences {
    val normalizedAllowed = allowedApps.map { it.normalizedPackageName() }.toSet()
    val normalizedDistracting = distractingApps
        .map { it.normalizedPackageName() }
        .filterNot { it in normalizedAllowed }
        .toSet()
    return DistractionAppPreferences(
        allowedApps = normalizedAllowed,
        distractingApps = normalizedDistracting,
    )
}
