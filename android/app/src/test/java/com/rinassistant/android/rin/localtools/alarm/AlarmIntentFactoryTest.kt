package com.rinassistant.android.rin.localtools.alarm

import android.provider.AlarmClock
import org.junit.Assert.assertEquals
import org.junit.Test

class AlarmIntentFactoryTest {
    private val factory = AlarmIntentFactory()

    @Test
    fun createsShowAlarmsSpec() {
        val spec = factory.createShowAlarmsSpec()

        assertEquals(AlarmClock.ACTION_SHOW_ALARMS, spec.action)
        assertEquals(emptyMap<String, Any>(), spec.extras)
    }

    @Test
    fun createsSetAlarmSpec() {
        val spec = factory.createSetAlarmSpec(
            SetAlarmInput(
                hour = 8,
                minutes = 15,
                message = "Focus",
                skipUi = true,
            ),
        )

        assertEquals(AlarmClock.ACTION_SET_ALARM, spec.action)
        assertEquals(8, spec.extras[AlarmClock.EXTRA_HOUR])
        assertEquals(15, spec.extras[AlarmClock.EXTRA_MINUTES])
        assertEquals("Focus", spec.extras[AlarmClock.EXTRA_MESSAGE])
        assertEquals(true, spec.extras[AlarmClock.EXTRA_SKIP_UI])
    }
}
