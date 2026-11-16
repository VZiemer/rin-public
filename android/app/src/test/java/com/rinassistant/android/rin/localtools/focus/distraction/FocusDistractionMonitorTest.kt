package com.rinassistant.android.rin.localtools.focus.distraction

import com.rinassistant.android.rin.localtools.focus.MutableFocusClock
import com.rinassistant.android.rin.localtools.usage.AppUsageEvent
import com.rinassistant.android.rin.localtools.usage.AppUsageReader
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test

class FocusDistractionMonitorTest {
    private val clock = MutableFocusClock(now = 1_000L)
    private val reader = FakeAppUsageReader()
    private val monitor = FocusDistractionMonitor(
        appUsageReader = reader,
        distractionPolicy = ConfiguredDistractionPolicy {
            DistractionAppPreferences(distractingApps = setOf("com.bad"))
        },
        clock = clock,
        checkIntervalMillis = 1_000L,
        reactionCooldownMillis = 5_000L,
    )

    @Test
    fun returnsEventForDistractingForegroundPackage() = runBlocking {
        reader.currentPackage = "com.bad"

        val event = monitor.checkForDistraction()

        assertEquals("com.bad", event?.packageName)
        assertEquals(1_000L, event?.detectedAtMillis)
        assertEquals(1, event?.sequenceNumber)
        assertEquals(event, monitor.lastEvent.value)
    }

    @Test
    fun returnsNullForAllowedOrUnknownPackage() = runBlocking {
        reader.currentPackage = "com.other"

        val event = monitor.checkForDistraction()

        assertEquals(null, event)
    }

    @Test
    fun respectsCheckInterval() = runBlocking {
        reader.currentPackage = "com.bad"
        monitor.checkForDistraction()
        clock.now = 1_500L

        val event = monitor.checkForDistraction()

        assertEquals(null, event)
        assertEquals(1, reader.currentPackageCalls)
    }

    @Test
    fun respectsReactionCooldown() = runBlocking {
        reader.currentPackage = "com.bad"
        monitor.checkForDistraction()
        clock.now = 2_000L
        monitor.checkForDistraction()

        assertEquals(null, monitor.checkForDistraction())
    }

    @Test
    fun allowsReactionAfterCooldown() = runBlocking {
        reader.currentPackage = "com.bad"
        monitor.checkForDistraction()
        clock.now = 7_000L

        val event = monitor.checkForDistraction()

        assertEquals(7_000L, event?.detectedAtMillis)
        assertEquals(2, event?.sequenceNumber)
    }

    @Test
    fun resetClearsReactionStateForNextSession() = runBlocking {
        reader.currentPackage = "com.bad"
        monitor.checkForDistraction()

        monitor.reset()
        clock.now = 1_500L
        val event = monitor.checkForDistraction()

        assertEquals(1_500L, event?.detectedAtMillis)
        assertEquals(1, event?.sequenceNumber)
        assertEquals(event, monitor.lastEvent.value)
    }

    private class FakeAppUsageReader : AppUsageReader {
        var currentPackage: String? = null
        var currentPackageCalls = 0
            private set

        override suspend fun getCurrentForegroundPackage(): String? {
            currentPackageCalls += 1
            return currentPackage
        }

        override suspend fun getRecentUsage(sinceMillis: Long): List<AppUsageEvent> = emptyList()
    }
}
