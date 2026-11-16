package com.rinassistant.android.rin.localtools.focus

class FakeFocusSessionStorage(
    initialSession: FocusSession? = null,
) : FocusSessionStorage {
    var storedSession: FocusSession? = initialSession
        private set

    override suspend fun save(session: FocusSession) {
        storedSession = session
    }

    override suspend fun load(): FocusSession? = storedSession

    override suspend fun clear() {
        storedSession = null
    }
}
