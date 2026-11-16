package com.rinassistant.android.rin.localtools.alarm

sealed class AlarmToolException(message: String) : Exception(message) {
    class NoCompatibleAlarmApp(action: String) : AlarmToolException(
        "No compatible alarm app can handle '$action'.",
    )
}
