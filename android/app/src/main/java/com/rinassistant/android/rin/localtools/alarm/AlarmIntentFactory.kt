package com.rinassistant.android.rin.localtools.alarm

import android.provider.AlarmClock

class AlarmIntentFactory {
    fun createShowAlarmsSpec(): AlarmIntentSpec =
        AlarmIntentSpec(action = AlarmClock.ACTION_SHOW_ALARMS)

    fun createSetAlarmSpec(input: SetAlarmInput): AlarmIntentSpec =
        AlarmIntentSpec(
            action = AlarmClock.ACTION_SET_ALARM,
            extras = mapOf(
                AlarmClock.EXTRA_HOUR to input.hour,
                AlarmClock.EXTRA_MINUTES to input.minutes,
                AlarmClock.EXTRA_MESSAGE to input.message,
                AlarmClock.EXTRA_SKIP_UI to input.skipUi,
            ),
        )
}
