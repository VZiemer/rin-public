package com.rinassistant.android.rin.domain.model

import org.junit.Assert.assertEquals
import org.junit.Test

class RinMessageTest {
    @Test
    fun acceptsUpToThreeActions() {
        val message = RinMessage(
            id = "message",
            text = "Hello",
            avatarState = AvatarState.NEUTRAL,
            priority = RinPriority.NORMAL,
            actions = listOf(
                RinActionDescriptor(id = "one", label = "One", action = RinAction.Dismiss),
                RinActionDescriptor(id = "two", label = "Two", action = RinAction.OpenApp),
                RinActionDescriptor(id = "three", label = "Three", action = RinAction.Snooze(minutes = 10)),
            ),
        )

        assertEquals(3, message.actions.size)
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsMoreThanThreeActions() {
        RinMessage(
            id = "message",
            text = "Hello",
            avatarState = AvatarState.NEUTRAL,
            priority = RinPriority.NORMAL,
            actions = listOf(
                RinActionDescriptor(id = "one", label = "One", action = RinAction.Dismiss),
                RinActionDescriptor(id = "two", label = "Two", action = RinAction.OpenApp),
                RinActionDescriptor(id = "three", label = "Three", action = RinAction.Snooze(minutes = 10)),
                RinActionDescriptor(id = "four", label = "Four", action = RinAction.Dismiss),
            ),
        )
    }
}
