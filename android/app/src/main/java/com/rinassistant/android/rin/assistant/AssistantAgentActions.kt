package com.rinassistant.android.rin.assistant

class AssistantAgentActions(
    private val input: AssistantInputController,
    private val todayRequest: String,
    private val reminderPrompt: String,
) {
    suspend fun select(action: AssistantQuickAction) {
        if (input.state.value.submitting) return
        when (action) {
            AssistantQuickAction.TODAYS_TASKS -> { input.edit(todayRequest); input.send() }
            AssistantQuickAction.ADD_REMINDER -> input.edit(reminderPrompt)
            else -> Unit
        }
    }
}
