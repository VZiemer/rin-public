package com.rinassistant.android.rin.assistant

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

data class AssistantInputState(val text: String = "", val submitting: Boolean = false, val failed: Boolean = false,
    val failure: com.rinassistant.android.rin.agent.AgentFailure? = null) {
    val isThinking: Boolean get() = submitting
}

class AssistantInputController(private val submitMessage: suspend (String) -> Unit) {
    private val mutableState = MutableStateFlow(AssistantInputState())
    val state = mutableState.asStateFlow()

    fun edit(text: String) {
        if (!state.value.submitting) mutableState.value = AssistantInputState(text)
    }

    suspend fun send() {
        val current = state.value
        if (current.submitting || current.text.isBlank()) return
        mutableState.value = current.copy(submitting = true, failed = false)
        try {
            submitMessage(current.text.trim())
            mutableState.value = AssistantInputState()
        } catch (error: CancellationException) {
            mutableState.value = current.copy(submitting = false)
            throw error
        } catch (error: Exception) {
            mutableState.value = current.copy(submitting = false, failed = true,
                failure = (error as? com.rinassistant.android.rin.agent.AgentException)?.reason)
        }
    }
}
