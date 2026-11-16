package com.rinassistant.android.rin.actions

import com.rinassistant.android.rin.domain.model.RinAction
import com.rinassistant.android.rin.localtools.focus.FocusController
import com.rinassistant.android.rin.overlay.state.OverlayStateStore

class LocalRinActionHandler(
    private val overlayStateStore: OverlayStateStore,
    private val appLauncher: RinAppLauncher,
    private val focusController: FocusController,
    private val localActionDispatcher: com.rinassistant.android.rin.localtools.LocalActionDispatcher? = null,
    private val alarmLabel: String = "Rin",
) : RinActionHandler {
    override suspend fun handle(action: RinAction) {
        when (action) {
            is RinAction.StartFocus -> {
                requireNotNull(localActionDispatcher).dispatch<com.rinassistant.android.rin.localtools.focus.StartFocusSessionInput, Unit>(
                    com.rinassistant.android.rin.localtools.focus.StartFocusTool.NAME,
                    com.rinassistant.android.rin.localtools.focus.StartFocusSessionInput(action.minutes),
                ).getOrThrow()
                overlayStateStore.clearMessage()
            }
            is RinAction.SetAlarm -> {
                requireNotNull(localActionDispatcher).dispatch<com.rinassistant.android.rin.localtools.alarm.SetAlarmInput, Unit>(
                    com.rinassistant.android.rin.localtools.alarm.SetAlarmTool.NAME,
                    com.rinassistant.android.rin.localtools.alarm.SetAlarmInput(action.hour, action.minutes, alarmLabel),
                ).getOrThrow()
                overlayStateStore.clearMessage()
            }
            RinAction.Dismiss -> overlayStateStore.clearMessage()
            is RinAction.Snooze -> overlayStateStore.clearMessage()
            RinAction.OpenApp -> {
                overlayStateStore.clearMessage()
                appLauncher.openApp()
            }
            RinAction.PauseFocus -> {
                focusController.pause()
            }
            RinAction.ResumeFocus -> {
                focusController.resume()
            }
            RinAction.CancelFocus -> {
                focusController.cancel()
                overlayStateStore.clearFocusPresentation()
            }
        }
    }
}
