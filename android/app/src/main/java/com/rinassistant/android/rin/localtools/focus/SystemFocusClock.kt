package com.rinassistant.android.rin.localtools.focus

class SystemFocusClock : FocusClock {
    override fun nowMillis(): Long = System.currentTimeMillis()
}
