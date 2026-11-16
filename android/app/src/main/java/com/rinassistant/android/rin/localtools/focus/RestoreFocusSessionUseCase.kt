package com.rinassistant.android.rin.localtools.focus

class RestoreFocusSessionUseCase(
    private val repository: FocusRepository,
    private val storage: FocusSessionStorage,
    private val timer: FocusTimer,
) {
    suspend fun restore(): FocusSession? {
        val storedSession = storage.load() ?: return null
        val restoredSession = if (timer.isExpired(storedSession)) {
            storedSession.copy(
                status = FocusStatus.COMPLETED,
                pausedAtMillis = null,
            )
        } else {
            storedSession
        }
        repository.save(restoredSession)
        storage.save(restoredSession)
        return restoredSession
    }
}
