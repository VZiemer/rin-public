package com.rinassistant.android.rin.assistant

import android.app.TimePickerDialog
import android.content.Context
import android.content.Intent
import android.view.WindowManager
import android.widget.Toast
import com.rinassistant.android.R
import com.rinassistant.android.rin.app.AppContainer
import com.rinassistant.android.rin.localtools.alarm.SetAlarmInput
import com.rinassistant.android.rin.localtools.alarm.SetAlarmTool
import com.rinassistant.android.rin.localtools.focus.StartFocusSessionInput
import com.rinassistant.android.rin.localtools.focus.FocusStatus
import com.rinassistant.android.rin.localtools.focus.service.FocusForegroundService
import com.rinassistant.android.rin.ui.main.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import java.util.Calendar

class AndroidAssistantActions(
    private val context: Context,
    private val container: AppContainer,
    private val scope: CoroutineScope,
    private val onAgentAction: suspend (AssistantQuickAction) -> Unit = {
        Toast.makeText(
            context,
            context.getString(
                R.string.assistant_agent_unavailable,
                com.rinassistant.android.rin.assistant.AssistantCatalog
                    .requireById(container.assistantSelectionStore.selectedAssistantId.value)
                    .displayName,
            ),
            Toast.LENGTH_SHORT,
        ).show()
    },
) {
    private var alarmDialog: TimePickerDialog? = null
    private var busy = false
    private val controller = AssistantQuickActionController(
        setAlarm = ::showAlarmPicker,
        startPomodoro = {
            val status = container.focusRepository.currentSession.value?.status
            if (status != FocusStatus.RUNNING && status != FocusStatus.PAUSED) {
                container.focusController.start(StartFocusSessionInput(25))
                context.startForegroundService(FocusForegroundService.createStartIntent(context))
            }
        },
        openSettings = {
            container.overlayStateStore.dismissAssistant()
            context.startActivity(Intent(context, MainActivity::class.java).apply {
                action = MainActivity.ACTION_SETTINGS
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            })
        },
        requestAgentAction = onAgentAction,
        openStatements = {
            container.overlayStateStore.dismissAssistant()
            context.startActivity(Intent(context, MainActivity::class.java).apply {
                action = MainActivity.ACTION_FINANCE
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            })
        },
    )

    fun select(action: AssistantQuickAction) {
        if (busy || alarmDialog != null) return
        busy = true
        scope.launch {
            try { controller.select(action) }
            catch (error: CancellationException) { throw error }
            catch (error: Exception) { showFailure() }
            finally { busy = false }
        }
    }

    private fun showAlarmPicker() {
        val now = Calendar.getInstance()
        alarmDialog = TimePickerDialog(context, { _, hour, minute ->
            scope.launch {
                val result = container.localActionDispatcher.dispatch<SetAlarmInput, Unit>(
                    SetAlarmTool.NAME,
                    SetAlarmInput(
                        hour,
                        minute,
                        context.getString(
                            R.string.assistant_alarm_label,
                            com.rinassistant.android.rin.assistant.AssistantCatalog
                                .requireById(container.assistantSelectionStore.selectedAssistantId.value)
                                .displayName,
                        ),
                    ),
                )
                if (result.isFailure) showFailure()
            }
        }, now.get(Calendar.HOUR_OF_DAY), now.get(Calendar.MINUTE), true).apply {
            // Activity-owned dialog: alarms do not require overlay permission.
            setOnDismissListener { alarmDialog = null }
            show()
        }
    }

    private fun showFailure() {
        Toast.makeText(context, R.string.assistant_action_failed, Toast.LENGTH_LONG).show()
    }

    fun close() { alarmDialog?.dismiss(); alarmDialog = null }
}
