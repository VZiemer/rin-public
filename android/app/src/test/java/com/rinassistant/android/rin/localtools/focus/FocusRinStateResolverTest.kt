package com.rinassistant.android.rin.localtools.focus

import com.rinassistant.android.rin.domain.model.AvatarState
import com.rinassistant.android.rin.localtools.focus.distraction.DistractionEvent
import org.junit.Assert.assertEquals
import org.junit.Test

class FocusRinStateResolverTest {
    private val resolver = FocusRinStateResolver(reactionWindowMillis = 10_000L)

    @Test
    fun resolvesRunningSessionToFocusedWhenThereIsNoActiveDistraction() {
        assertEquals(
            AvatarState.FOCUSED,
            resolver.resolve(
                status = FocusStatus.RUNNING,
                distractionEvent = null,
                nowMillis = 20_000L,
            ),
        )
    }

    @Test
    fun resolvesFirstRecentDistractionToScolding() {
        assertEquals(
            AvatarState.SCOLDING,
            resolver.resolve(
                status = FocusStatus.RUNNING,
                distractionEvent = DistractionEvent(
                    packageName = "com.bad",
                    detectedAtMillis = 10_000L,
                    sequenceNumber = 1,
                ),
                nowMillis = 12_000L,
            ),
        )
    }

    @Test
    fun resolvesRepeatedRecentDistractionToAngryPout() {
        assertEquals(
            AvatarState.ANGRY_POUT,
            resolver.resolve(
                status = FocusStatus.RUNNING,
                distractionEvent = DistractionEvent(
                    packageName = "com.bad",
                    detectedAtMillis = 10_000L,
                    sequenceNumber = 2,
                ),
                nowMillis = 12_000L,
            ),
        )
    }

    @Test
    fun ignoresStaleDistractionEvent() {
        assertEquals(
            AvatarState.FOCUSED,
            resolver.resolve(
                status = FocusStatus.RUNNING,
                distractionEvent = DistractionEvent(
                    packageName = "com.bad",
                    detectedAtMillis = 1_000L,
                    sequenceNumber = 2,
                ),
                nowMillis = 20_000L,
            ),
        )
    }

    @Test
    fun resolvesPausedSessionToTired() {
        assertEquals(
            AvatarState.TIRED,
            resolver.resolve(
                status = FocusStatus.PAUSED,
                distractionEvent = DistractionEvent(
                    packageName = "com.bad",
                    detectedAtMillis = 10_000L,
                    sequenceNumber = 2,
                ),
                nowMillis = 12_000L,
            ),
        )
    }
}
