package com.rinassistant.android.rin.localtools.focus

class FocusNotificationFormatter {
    fun formatRemaining(remainingMillis: Long): String {
        val totalSeconds = (remainingMillis.coerceAtLeast(0L) + MILLIS_PER_SECOND - 1) / MILLIS_PER_SECOND
        val minutes = totalSeconds / SECONDS_PER_MINUTE
        val seconds = totalSeconds % SECONDS_PER_MINUTE
        return "%02d:%02d".format(minutes, seconds)
    }

    private companion object {
        private const val MILLIS_PER_SECOND = 1_000L
        private const val SECONDS_PER_MINUTE = 60L
    }
}
