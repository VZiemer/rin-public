package com.rinassistant.android.rin.assistant

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

interface AssistantSelectionStore {
    val selectedAssistantId: StateFlow<String>
    suspend fun setSelectedAssistantId(assistantId: String)
}

class InMemoryAssistantSelectionStore(
    initialId: String = AssistantCatalog.DEFAULT_ID,
) : AssistantSelectionStore {
    private val mutableSelected = MutableStateFlow(AssistantCatalog.requireById(initialId).id)
    override val selectedAssistantId: StateFlow<String> = mutableSelected.asStateFlow()

    override suspend fun setSelectedAssistantId(assistantId: String) {
        mutableSelected.value = AssistantCatalog.requireById(assistantId).id
    }
}
