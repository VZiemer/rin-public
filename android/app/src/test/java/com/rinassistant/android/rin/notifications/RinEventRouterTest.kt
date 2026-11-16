package com.rinassistant.android.rin.notifications

import com.rinassistant.android.rin.domain.model.RinMessage
import com.rinassistant.android.rin.domain.model.RinPriority
import com.rinassistant.android.rin.domain.model.AvatarState
import org.junit.Assert.assertEquals
import org.junit.Test

class RinEventRouterTest {
    private val message = RinMessage("push-1", "Hello", AvatarState.SMUG, RinPriority.NORMAL, emptyList())

    @Test
    fun `overlay delivery does not post a duplicate notification`() {
        val delivered = mutableListOf<RinMessage>()
        var notifications = 0
        RinEventRouter(
            showOverlayMessage = { delivered.add(it); true },
            showFallbackNotification = { notifications++ },
        ).route(message)

        assertEquals(listOf(message), delivered)
        assertEquals(0, notifications)
    }

    @Test
    fun `unavailable overlay preserves notification fallback`() {
        var notifications = 0
        RinEventRouter(
            showOverlayMessage = { false },
            showFallbackNotification = { notifications++ },
        ).route(message)

        assertEquals(1, notifications)
    }
}
