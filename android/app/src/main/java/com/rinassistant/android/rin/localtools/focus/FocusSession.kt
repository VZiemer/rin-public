package com.rinassistant.android.rin.localtools.focus

data class FocusSession(
    val id: String,
    val durationMillis: Long,
    val startedAtMillis: Long,
    val endsAtMillis: Long,
    val status: FocusStatus,
    val pausedAtMillis: Long? = null,
)
