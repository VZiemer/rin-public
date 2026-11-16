package com.rinassistant.android.rin.notifications

import com.rinassistant.android.rin.assistant.AssistantCatalog
import com.rinassistant.android.rin.overlay.state.OverlayStateStore
import org.junit.Assert.assertEquals
import org.junit.Test

class AssistantPushMapperTest {
    @Test
    fun mapsAssistantIdFromPushAndRendersThatAssistantEvenIfAnotherIsSelected() {
        val mapper = RinBackendMessageMapper()
        val message = mapper.map(
            mapOf(
                "type" to "ASSISTANT_MESSAGE",
                "assistantId" to "yui",
                "message" to "Oi",
                "avatarState" to "NEUTRAL",
                "priority" to "NORMAL",
                "actions" to "[]",
            ),
            "fallback",
        )
        assertEquals("YUI", message.assistantId)

        val store = OverlayStateStore()
        store.setSelectedAssistant(AssistantCatalog.DEFAULT_ID)
        store.showMessage(message)
        assertEquals(AssistantCatalog.DEFAULT_ID, store.state.value.selectedAssistantId)
        assertEquals("YUI", store.state.value.presentationAssistantId)
        assertEquals("YUI", store.state.value.visibleAssistantId)
    }

    @Test
    fun oldPayloadWithoutAssistantIdDefaultsToRin() {
        val message = RinBackendMessageMapper().map(
            mapOf("message" to "Oi", "avatarState" to "SMUG"),
            "fallback",
        )
        assertEquals("RIN", message.assistantId)
    }
}
