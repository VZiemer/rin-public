package com.rinassistant.android.rin.localtools.focus

class MutableFocusClock(
    var now: Long,
) : FocusClock {
    override fun nowMillis(): Long = now
}
