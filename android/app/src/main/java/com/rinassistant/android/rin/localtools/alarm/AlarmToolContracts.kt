package com.rinassistant.android.rin.localtools.alarm

data object GetNextAlarmInput

data class GetNextAlarmOutput(
    val alarm: DeviceAlarm?,
)

data object OpenAlarmsInput

data class SetAlarmInput(
    val hour: Int,
    val minutes: Int,
    val message: String,
    val skipUi: Boolean = false,
) {
    init {
        require(hour in MIN_HOUR..MAX_HOUR) { "Alarm hour must be between $MIN_HOUR and $MAX_HOUR." }
        require(minutes in MIN_MINUTES..MAX_MINUTES) {
            "Alarm minutes must be between $MIN_MINUTES and $MAX_MINUTES."
        }
        require(message.isNotBlank()) { "Alarm message must not be blank." }
    }

    companion object {
        private const val MIN_HOUR = 0
        private const val MAX_HOUR = 23
        private const val MIN_MINUTES = 0
        private const val MAX_MINUTES = 59
    }
}
