package com.rinassistant.android.rin.localtools.focus

import com.rinassistant.android.rin.domain.model.RinPriority
import com.rinassistant.android.rin.domain.model.AvatarState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FocusCompletionMessageFactoryTest {
    @Test
    fun createsPositiveCompletionMessage() {
        val message = FocusCompletionMessageFactory().create("Done.")

        assertEquals(FocusCompletionMessageFactory.MESSAGE_ID, message.id)
        assertEquals("Done.", message.text)
        assertEquals(AvatarState.SOFT_SMILE, message.avatarState)
        assertEquals(RinPriority.NORMAL, message.priority)
        assertTrue(message.actions.isEmpty())
    }
}
