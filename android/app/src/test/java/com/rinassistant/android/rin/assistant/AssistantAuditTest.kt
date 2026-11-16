package com.rinassistant.android.rin.assistant

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AssistantAuditTest {
    @Test
    fun catalogIsTheOnlyAssistantSpecificAssetSource() {
        val ids = AssistantCatalog.all().map { it.id }
        assertEquals(listOf("RIN", "YUI"), ids)
        assertTrue(AssistantCatalog.all().all { it.theme.primaryColor != 0L })
        assertTrue(AssistantCatalog.all().none { it.displayName.isBlank() })
        assertEquals(AssistantCatalog.yui, AssistantCatalog.requireById("YUI"))
        assertEquals(AssistantCatalog.rin, AssistantCatalog.requireById("stale"))
    }
}
