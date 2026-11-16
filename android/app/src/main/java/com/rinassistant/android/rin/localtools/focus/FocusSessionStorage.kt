package com.rinassistant.android.rin.localtools.focus

interface FocusSessionStorage {
    suspend fun save(session: FocusSession)
    suspend fun load(): FocusSession?
    suspend fun clear()
}
