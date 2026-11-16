package com.rinassistant.android.rin.assistant

import com.rinassistant.android.R
import com.rinassistant.android.rin.domain.model.AvatarState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AssistantDefinitionTest {
    @Test
    fun rinDefinitionCarriesPresentationDataWithoutPromptContent() {
        val rin = AssistantCatalog.rin
        assertEquals("RIN", rin.id)
        assertEquals("Rin", rin.displayName)
        assertEquals(RinAssistantTheme, rin.theme)
        assertEquals(R.drawable.rin_01_neutral, rin.avatarAssets.fallback)
        assertEquals(R.drawable.rin_02_scolding, rin.avatarAssets.drawableFor(AvatarState.SCOLDING))
        assertTrue(rin.description.isNotBlank())
        assertNull(rin::class.java.declaredFields.find { it.name.contains("persona", ignoreCase = true) })
        assertNull(rin::class.java.declaredFields.find { it.name.contains("prompt", ignoreCase = true) })
    }

    @Test
    fun catalogFallsBackToRinWhenAssistantIsUnknown() {
        assertEquals(AssistantCatalog.rin, AssistantCatalog.requireById("NOPE"))
        assertEquals(AssistantCatalog.rin, AssistantCatalog.requireById(null))
        assertEquals(AssistantCatalog.rin, AssistantCatalog.getById("rin"))
    }
}
