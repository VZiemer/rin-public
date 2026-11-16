package com.rinassistant.android.rin.assistant

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class AssistantCopyTest {
    @Test
    fun formatsLocalizedCopyFromTheActiveAssistant() {
        val hint = "Fale com a %1\$s…"
        assertEquals("Fale com a Rin…", hint.format("Rin"))
        assertEquals("Fale com a Yui…", hint.format("Yui"))
        assertFalse(hint.contains("Rin"))
    }
}
