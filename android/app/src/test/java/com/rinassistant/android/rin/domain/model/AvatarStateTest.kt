package com.rinassistant.android.rin.domain.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AvatarStateTest {
    @Test
    fun keepsSharedSemanticStatesWithoutAssistantSpecificEnums() {
        val expected = setOf(
            AvatarState.NEUTRAL,
            AvatarState.SCOLDING,
            AvatarState.SMUG,
            AvatarState.EMBARRASSED,
            AvatarState.ANGRY_POUT,
            AvatarState.SURPRISED,
            AvatarState.SOFT_SMILE,
            AvatarState.FOCUSED,
            AvatarState.TIRED,
            AvatarState.HAPPY,
            AvatarState.CONCERNED,
        )
        assertEquals(expected, AvatarState.entries.toSet())
        assertTrue(AvatarState.entries.none { it.name.contains("RIN") || it.name.contains("YUI") })
    }
}
