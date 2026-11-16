package com.rinassistant.android.rin.localtools.focus

data class StartFocusSessionInput(
    val durationMinutes: Int,
) {
    init {
        require(durationMinutes in MIN_DURATION_MINUTES..MAX_DURATION_MINUTES) {
            "Focus duration must be between $MIN_DURATION_MINUTES and $MAX_DURATION_MINUTES minutes."
        }
    }

    fun durationMillis(): Long = durationMinutes * MILLIS_PER_MINUTE

    companion object {
        const val MIN_DURATION_MINUTES = 1
        const val MAX_DURATION_MINUTES = 180
        private const val MILLIS_PER_MINUTE = 60_000L
    }
}
