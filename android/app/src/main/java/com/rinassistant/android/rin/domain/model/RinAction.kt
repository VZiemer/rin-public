package com.rinassistant.android.rin.domain.model

sealed interface RinAction {
    data class StartFocus(val minutes: Int) : RinAction
    data class SetAlarm(val hour: Int, val minutes: Int) : RinAction
    data object Dismiss : RinAction
    data class Snooze(val minutes: Int) : RinAction {
        init {
            require(minutes > 0) { "Snooze minutes must be greater than zero." }
        }
    }
    data object OpenApp : RinAction
    data object PauseFocus : RinAction
    data object ResumeFocus : RinAction
    data object CancelFocus : RinAction
}
