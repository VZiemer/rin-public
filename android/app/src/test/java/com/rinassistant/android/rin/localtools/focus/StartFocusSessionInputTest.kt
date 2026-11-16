package com.rinassistant.android.rin.localtools.focus

import org.junit.Assert.assertEquals
import org.junit.Test

class StartFocusSessionInputTest {
    @Test
    fun convertsMinutesToMillis() {
        assertEquals(25 * 60_000L, StartFocusSessionInput(durationMinutes = 25).durationMillis())
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsTooShortDuration() {
        StartFocusSessionInput(durationMinutes = 0)
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsTooLongDuration() {
        StartFocusSessionInput(durationMinutes = 181)
    }
}
