package com.rinassistant.android.rin.overlay.renderer

import com.rinassistant.android.rin.assistant.RinAssistantTheme
import org.junit.Assert.assertEquals
import org.junit.Test

class AssistantThemeTest {
    @Test
    fun rinThemeKeepsCurrentOverlayPalette() {
        assertEquals(0xFF7C3AED, RinAssistantTheme.primaryColor)
        assertEquals(0xFF6D28D9, RinAssistantTheme.secondaryColor)
        assertEquals(0xFFB794F6, RinAssistantTheme.accentColor)
        assertEquals(0xFF7C3AED, RinAssistantTheme.bubbleStartColor)
        assertEquals(0xF20B1026, RinAssistantTheme.backdropStartColor)
        assertEquals(0xFF7C3AED, RinAssistantTheme.sendButtonColor)
    }
}
