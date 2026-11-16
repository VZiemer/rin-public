package com.rinassistant.android.rin.domain.model

import org.junit.Test

class RinActionTest {
    @Test(expected = IllegalArgumentException::class)
    fun snoozeRejectsNonPositiveMinutes() {
        RinAction.Snooze(minutes = 0)
    }
}
