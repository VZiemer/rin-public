package com.rinassistant.android.rin.localtools.alarm

import org.junit.Assert.assertEquals
import org.junit.Test

class SetAlarmInputTest {
    @Test
    fun acceptsValidAlarmTime() {
        val input = SetAlarmInput(
            hour = 7,
            minutes = 30,
            message = "Wake up",
        )

        assertEquals(7, input.hour)
        assertEquals(30, input.minutes)
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsInvalidHour() {
        SetAlarmInput(
            hour = 24,
            minutes = 0,
            message = "Wake up",
        )
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsInvalidMinutes() {
        SetAlarmInput(
            hour = 7,
            minutes = 60,
            message = "Wake up",
        )
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsBlankMessage() {
        SetAlarmInput(
            hour = 7,
            minutes = 30,
            message = " ",
        )
    }
}
