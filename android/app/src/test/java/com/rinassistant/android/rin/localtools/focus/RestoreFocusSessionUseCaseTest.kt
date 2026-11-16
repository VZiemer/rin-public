package com.rinassistant.android.rin.localtools.focus

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test

class RestoreFocusSessionUseCaseTest {
    private val clock = MutableFocusClock(now = 1_000L)
    private val repository = InMemoryFocusRepository()
    private val storage = FakeFocusSessionStorage()
    private val useCase = RestoreFocusSessionUseCase(
        repository = repository,
        storage = storage,
        timer = FocusTimer(clock),
    )

    @Test
    fun restoresRunningSessionWhenTimeRemains() = runBlocking {
        val storedSession = session(
            endsAtMillis = 61_000L,
            status = FocusStatus.RUNNING,
        )
        storage.save(storedSession)

        val restoredSession = useCase.restore()

        assertEquals(storedSession, restoredSession)
        assertEquals(storedSession, repository.currentSession.value)
        assertEquals(storedSession, storage.storedSession)
    }

    @Test
    fun restoresExpiredRunningSessionAsCompleted() = runBlocking {
        val storedSession = session(
            endsAtMillis = 1_000L,
            status = FocusStatus.RUNNING,
        )
        storage.save(storedSession)

        val restoredSession = useCase.restore()

        assertEquals(FocusStatus.COMPLETED, restoredSession?.status)
        assertEquals(restoredSession, repository.currentSession.value)
        assertEquals(restoredSession, storage.storedSession)
    }

    @Test
    fun returnsNullWhenNoSessionIsStored() = runBlocking {
        val restoredSession = useCase.restore()

        assertEquals(null, restoredSession)
        assertEquals(null, repository.currentSession.value)
    }

    private fun session(
        endsAtMillis: Long,
        status: FocusStatus,
    ): FocusSession =
        FocusSession(
            id = "focus",
            durationMillis = 60_000L,
            startedAtMillis = 1_000L,
            endsAtMillis = endsAtMillis,
            status = status,
        )
}
