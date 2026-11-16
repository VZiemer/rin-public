package com.rinassistant.android.rin.localtools.usage

import org.junit.Assert.assertEquals
import org.junit.Test

class AppUsageEventInterpreterTest {
    private val interpreter = AppUsageEventInterpreter()

    @Test
    fun returnsLastForegroundPackage() {
        val packageName = interpreter.currentForegroundPackage(
            listOf(
                event("com.first", 1L, AppUsageEventType.FOREGROUND),
                event("com.second", 2L, AppUsageEventType.FOREGROUND),
            ),
        )

        assertEquals("com.second", packageName)
    }

    @Test
    fun returnsNullWhenCurrentPackageMovesToBackground() {
        val packageName = interpreter.currentForegroundPackage(
            listOf(
                event("com.app", 1L, AppUsageEventType.FOREGROUND),
                event("com.app", 2L, AppUsageEventType.BACKGROUND),
            ),
        )

        assertEquals(null, packageName)
    }

    @Test
    fun ignoresBackgroundEventForDifferentPackage() {
        val packageName = interpreter.currentForegroundPackage(
            listOf(
                event("com.focus", 1L, AppUsageEventType.FOREGROUND),
                event("com.other", 2L, AppUsageEventType.BACKGROUND),
            ),
        )

        assertEquals("com.focus", packageName)
    }

    @Test
    fun sortsEventsByTimeBeforeInterpreting() {
        val packageName = interpreter.currentForegroundPackage(
            listOf(
                event("com.second", 20L, AppUsageEventType.FOREGROUND),
                event("com.first", 10L, AppUsageEventType.FOREGROUND),
            ),
        )

        assertEquals("com.second", packageName)
    }

    @Test
    fun ignoresOtherEvents() {
        val packageName = interpreter.currentForegroundPackage(
            listOf(
                event("com.app", 1L, AppUsageEventType.FOREGROUND),
                event("com.noise", 2L, AppUsageEventType.OTHER),
            ),
        )

        assertEquals("com.app", packageName)
    }

    private fun event(
        packageName: String,
        time: Long,
        type: AppUsageEventType,
    ): AppUsageEvent =
        AppUsageEvent(
            packageName = packageName,
            eventTimeMillis = time,
            type = type,
        )
}
