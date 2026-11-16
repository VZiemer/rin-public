package com.rinassistant.android.rin.localtools.focus

import org.junit.Assert.assertEquals
import org.junit.Test

class FocusNotificationFormatterTest {
    private val formatter = FocusNotificationFormatter()

    @Test
    fun formatsWholeMinutesAndSeconds() {
        assertEquals("24:32", formatter.formatRemaining(24 * 60_000L + 32_000L))
    }

    @Test
    fun roundsPartialSecondsUp() {
        assertEquals("00:02", formatter.formatRemaining(1_001L))
    }

    @Test
    fun clampsNegativeRemainingToZero() {
        assertEquals("00:00", formatter.formatRemaining(-1L))
    }
}
