package com.rinassistant.android.rin.localtools.focus.distraction

interface DistractionPolicy {
    fun classify(packageName: String): AppFocusClassification
}
