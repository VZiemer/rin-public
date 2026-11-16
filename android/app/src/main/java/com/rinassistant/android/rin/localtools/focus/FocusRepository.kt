package com.rinassistant.android.rin.localtools.focus

import kotlinx.coroutines.flow.StateFlow

interface FocusRepository {
    val currentSession: StateFlow<FocusSession?>

    fun save(session: FocusSession)
    fun clear()
}
