package com.rinassistant.android.rin.localtools.alarm

data class AlarmIntentSpec(
    val action: String,
    val extras: Map<String, Any> = emptyMap(),
)
