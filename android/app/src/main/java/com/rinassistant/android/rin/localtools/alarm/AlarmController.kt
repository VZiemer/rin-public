package com.rinassistant.android.rin.localtools.alarm

interface AlarmController {
    fun getNextAlarm(): DeviceAlarm?
    fun openAlarms(): Result<Unit>
    fun setAlarm(input: SetAlarmInput): Result<Unit>
}
