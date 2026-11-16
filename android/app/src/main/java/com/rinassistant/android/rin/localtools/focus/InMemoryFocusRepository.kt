package com.rinassistant.android.rin.localtools.focus

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class InMemoryFocusRepository : FocusRepository {
    private val mutableCurrentSession = MutableStateFlow<FocusSession?>(null)
    override val currentSession: StateFlow<FocusSession?> = mutableCurrentSession.asStateFlow()

    override fun save(session: FocusSession) {
        mutableCurrentSession.value = session
    }

    override fun clear() {
        mutableCurrentSession.value = null
    }
}
