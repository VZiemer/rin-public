package com.rinassistant.android.rin.localtools.focus

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FocusTimerTest {
    private val clock = MutableFocusClock(now = 1_000L)
    private val timer = FocusTimer(clock)

    @Test
    fun calculatesRunningRemainingTimeFromEndTimestamp() {
        val session = session(
            endsAtMillis = 11_000L,
            status = FocusStatus.RUNNING,
        )

        assertEquals(10_000L, timer.remainingMillis(session))
    }

    @Test
    fun clampsRunningRemainingTimeAtZero() {
        val session = session(
            endsAtMillis = 500L,
            status = FocusStatus.RUNNING,
        )

        assertEquals(0L, timer.remainingMillis(session))
    }

    @Test
    fun calculatesPausedRemainingTimeFromPausedTimestamp() {
        val session = session(
            endsAtMillis = 11_000L,
            status = FocusStatus.PAUSED,
            pausedAtMillis = 4_000L,
        )
        clock.now = 8_000L

        assertEquals(7_000L, timer.remainingMillis(session))
    }

    @Test
    fun detectsExpiredRunningSession() {
        val session = session(
            endsAtMillis = 1_000L,
            status = FocusStatus.RUNNING,
        )

        assertTrue(timer.isExpired(session))
    }

    @Test
    fun doesNotExpirePausedSession() {
        val session = session(
            endsAtMillis = 1_000L,
            status = FocusStatus.PAUSED,
            pausedAtMillis = 1_000L,
        )

        assertFalse(timer.isExpired(session))
    }

    private fun session(
        endsAtMillis: Long,
        status: FocusStatus,
        pausedAtMillis: Long? = null,
    ): FocusSession =
        FocusSession(
            id = "focus",
            durationMillis = 10_000L,
            startedAtMillis = 1_000L,
            endsAtMillis = endsAtMillis,
            status = status,
            pausedAtMillis = pausedAtMillis,
        )
}
