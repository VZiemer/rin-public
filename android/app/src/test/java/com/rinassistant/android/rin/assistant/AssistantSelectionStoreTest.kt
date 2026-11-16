package com.rinassistant.android.rin.assistant

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test

class AssistantSelectionStoreTest {
    @Test
    fun persistsSelectionIndependentlyFromDeviceIdAndFallsBackToDefault() = runBlocking {
        val store = InMemoryAssistantSelectionStore()
        assertEquals(AssistantCatalog.DEFAULT_ID, store.selectedAssistantId.value)

        store.setSelectedAssistantId("rin")
        assertEquals("RIN", store.selectedAssistantId.value)

        store.setSelectedAssistantId("missing")
        assertEquals(AssistantCatalog.DEFAULT_ID, store.selectedAssistantId.value)
    }
}
