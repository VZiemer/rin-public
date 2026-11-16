package com.rinassistant.android.rin.localtools.focus

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FocusControllerTest {
    private val clock = MutableFocusClock(now = 1_000L)
    private val repository = InMemoryFocusRepository()
    private val storage = FakeFocusSessionStorage()
    private val controller = FocusController(
        repository = repository,
        clock = clock,
        storage = storage,
        idProvider = { "focus-1" },
    )

    @Test
    fun startCreatesRunningSessionFromTimestamps() = runBlocking {
        val session = controller.start(StartFocusSessionInput(durationMinutes = 25))

        assertEquals("focus-1", session.id)
        assertEquals(FocusStatus.RUNNING, session.status)
        assertEquals(1_000L, session.startedAtMillis)
        assertEquals(1_000L + 25 * 60_000L, session.endsAtMillis)
        assertEquals(session, repository.currentSession.value)
        assertEquals(session, storage.storedSession)
    }

    @Test
    fun pauseKeepsRemainingTimeAtPauseMoment() = runBlocking {
        controller.start(StartFocusSessionInput(durationMinutes = 1))
        clock.now = 11_000L

        val paused = controller.pause().getOrThrow()

        assertEquals(FocusStatus.PAUSED, paused.status)
        assertEquals(11_000L, paused.pausedAtMillis)
        assertEquals(50_000L, controller.remainingMillis().getOrThrow())
        assertEquals(paused, storage.storedSession)
    }

    @Test
    fun resumeMovesEndTimestampForwardByPausedRemainingTime() = runBlocking {
        controller.start(StartFocusSessionInput(durationMinutes = 1))
        clock.now = 11_000L
        controller.pause()
        clock.now = 31_000L

        val resumed = controller.resume().getOrThrow()

        assertEquals(FocusStatus.RUNNING, resumed.status)
        assertEquals(null, resumed.pausedAtMillis)
        assertEquals(81_000L, resumed.endsAtMillis)
        assertEquals(resumed, storage.storedSession)
    }

    @Test
    fun cancelMarksSessionCancelled() = runBlocking {
        controller.start(StartFocusSessionInput(durationMinutes = 1))

        val cancelled = controller.cancel().getOrThrow()

        assertEquals(FocusStatus.CANCELLED, cancelled.status)
        assertEquals(cancelled, repository.currentSession.value)
        assertEquals(cancelled, storage.storedSession)
    }

    @Test
    fun completeIfExpiredMarksSessionCompleted() = runBlocking {
        controller.start(StartFocusSessionInput(durationMinutes = 1))
        clock.now = 61_000L

        val completed = controller.completeIfExpired().getOrThrow()

        assertEquals(FocusStatus.COMPLETED, completed.status)
        assertEquals(completed, storage.storedSession)
    }

    @Test
    fun completeIfExpiredKeepsRunningSessionWhenTimeRemains() = runBlocking {
        val running = controller.start(StartFocusSessionInput(durationMinutes = 1))

        val result = controller.completeIfExpired().getOrThrow()

        assertEquals(running, result)
        assertEquals(FocusStatus.RUNNING, result.status)
    }

    @Test
    fun pauseFailsWithoutActiveSession() = runBlocking {
        val result = controller.pause()

        assertTrue(result.exceptionOrNull() is FocusException.NoActiveSession)
    }

    @Test
    fun resumeFailsWhenSessionIsNotPaused() = runBlocking {
        controller.start(StartFocusSessionInput(durationMinutes = 1))

        val result = controller.resume()

        assertTrue(result.exceptionOrNull() is FocusException.InvalidStatus)
    }
}
