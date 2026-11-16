package com.rinassistant.android.rin.assistant

enum class AssistantQuickAction { SET_ALARM, START_POMODORO, TODAYS_TASKS, ADD_REMINDER, SETTINGS, IMPORT_STATEMENT }

class AssistantQuickActionController(
    private val setAlarm: suspend () -> Unit,
    private val startPomodoro: suspend () -> Unit,
    private val openSettings: suspend () -> Unit,
    private val requestAgentAction: suspend (AssistantQuickAction) -> Unit,
    private val openStatements: suspend () -> Unit = {},
) {
    suspend fun select(action: AssistantQuickAction) {
        when (action) {
            AssistantQuickAction.SET_ALARM -> setAlarm()
            AssistantQuickAction.START_POMODORO -> startPomodoro()
            AssistantQuickAction.SETTINGS -> openSettings()
            AssistantQuickAction.IMPORT_STATEMENT -> openStatements()
            AssistantQuickAction.TODAYS_TASKS, AssistantQuickAction.ADD_REMINDER -> requestAgentAction(action)
        }
    }
}
