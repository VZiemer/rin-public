package com.rinassistant.android.rin.localtools.focus

class NoOpFocusSessionStorage : FocusSessionStorage {
    override suspend fun save(session: FocusSession) = Unit
    override suspend fun load(): FocusSession? = null
    override suspend fun clear() = Unit
}
