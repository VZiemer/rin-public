package com.rinassistant.android.rin.localtools.focus.distraction

data class DistractionEvent(
    val packageName: String,
    val detectedAtMillis: Long,
    val sequenceNumber: Int,
)
