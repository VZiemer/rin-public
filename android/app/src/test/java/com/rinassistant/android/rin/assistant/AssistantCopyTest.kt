package com.rinassistant.android.rin.assistant

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class AssistantCopyTest {
    @Test
    fun formatsLocalizedCopyFromTheActiveAssistant() {
        val hint = "Talk to %1\$s…"
        assertEquals("Talk to Rin…", hint.format("Rin"))
        assertEquals("Talk to Yui…", hint.format("Yui"))
        assertFalse(hint.contains("Rin"))
    }
}
