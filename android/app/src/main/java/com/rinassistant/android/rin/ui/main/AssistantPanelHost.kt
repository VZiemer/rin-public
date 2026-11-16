package com.rinassistant.android.rin.ui.main

import android.widget.Toast
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import com.rinassistant.android.R
import com.rinassistant.android.rin.agent.AgentFailure
import com.rinassistant.android.rin.agent.AgentResponseMapper
import com.rinassistant.android.rin.app.AppContainer
import com.rinassistant.android.rin.app.RinApplication
import com.rinassistant.android.rin.assistant.AndroidAssistantActions
import com.rinassistant.android.rin.assistant.AssistantAgentActions
import com.rinassistant.android.rin.assistant.AssistantInputController
import com.rinassistant.android.rin.assistant.MessageActionController
import com.rinassistant.android.rin.domain.model.RinAction
import com.rinassistant.android.rin.domain.model.AvatarState
import com.rinassistant.android.rin.overlay.model.OverlayUiState
import com.rinassistant.android.rin.assistant.AssistantCatalog
import com.rinassistant.android.rin.overlay.renderer.AssistantAssetResolver
import com.rinassistant.android.rin.overlay.ui.RinPanelCallbacks
import com.rinassistant.android.rin.overlay.ui.RinPanelUiModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch


class AssistantPanelHost(private val activity: MainActivity) {
    private val appContainer = (activity.application as RinApplication).appContainer
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private lateinit var assistantActions: AndroidAssistantActions
    private lateinit var messageActions: MessageActionController
    var model by mutableStateOf<RinPanelUiModel?>(null)
        private set
    val callbacks: RinPanelCallbacks
    private fun getString(id: Int, vararg args: Any): String = activity.getString(id, *args)
    private val inputController = AssistantInputController {
        appContainer.overlayStateStore.clearPreviousReply()
        val response = appContainer.agentRepository.send(it)
        appContainer.remoteAvatarImages.selectIfPresent(response.assistantId, response.imageName)
        appContainer.overlayStateStore.showMessage(
            AgentResponseMapper { action ->
                when (action) {
                    is RinAction.StartFocus -> getString(R.string.assistant_confirm_focus, action.minutes)
                    is RinAction.SetAlarm -> getString(R.string.assistant_confirm_alarm, action.hour, action.minutes)
                    else -> getString(R.string.assistant_send)
                }
            }.map(response),
        )
    }


    init {
        val agentActions = AssistantAgentActions(
            inputController,
            getString(R.string.assistant_today_request),
            getString(R.string.assistant_reminder_prompt),
        )
        assistantActions = AndroidAssistantActions(activity, appContainer, serviceScope, agentActions::select)
        messageActions = MessageActionController(appContainer.overlayStateStore) {
            appContainer.createHandleRinActionUseCase().handle(it)
        }


        callbacks = RinPanelCallbacks(
            onInputChange = inputController::edit,
            onSend = { serviceScope.launch { inputController.send() } },
            onQuickAction = assistantActions::select,
            onMessageAction = { id, action ->
                serviceScope.launch {
                    try {
                        messageActions.select(id, action)
                    } catch (error: CancellationException) {
                        throw error
                    } catch (error: Exception) {
                        Toast.makeText(activity, R.string.assistant_action_failed, Toast.LENGTH_LONG).show()
                    }
                }
            },
            onClose = { activity.finish() },
        )


        serviceScope.launch { appContainer.overlayStateStore.state.collect { render() } }
        serviceScope.launch { inputController.state.collect { render() } }
        serviceScope.launch { appContainer.remoteAvatarImages.bitmaps.collect { render() } }
        serviceScope.launch {
            appContainer.assistantSelectionStore.selectedAssistantId.collect {
                appContainer.overlayStateStore.setSelectedAssistant(it)
                render()
            }
        }
    }
    private fun render() { model = buildPanelModel(appContainer.overlayStateStore.state.value) }
    fun close() { assistantActions.close(); serviceScope.cancel() }
    private fun buildPanelModel(state: OverlayUiState): RinPanelUiModel {
        val inputState = inputController.state.value
        val assistant = AssistantCatalog.requireById(state.visibleAssistantId)
        val avatarState = if (inputState.isThinking) AvatarState.FOCUSED else state.avatarState
        val failureText = if (!inputState.failed) {
            null
        } else when (inputState.failure) {
            AgentFailure.NOT_CONFIGURED -> getString(R.string.assistant_agent_unavailable, assistant.displayName)
            AgentFailure.ASSISTANT_NOT_FOUND -> getString(R.string.assistant_not_found, assistant.displayName)
            AgentFailure.UNAUTHENTICATED -> getString(R.string.auth_required)
            else -> getString(R.string.assistant_action_failed)
        }
        val resolver = AssistantAssetResolver(activity)
        val avatarRes = resolver.drawableFor(assistant.id, avatarState)
        val remoteAvatar = appContainer.remoteAvatarImages.bitmaps.value[assistant.id]
        val theme = assistant.theme
        return RinPanelUiModel(
            displayName = assistant.displayName,
            accentColor = theme.accentColor,
            bubbleStartColor = theme.bubbleStartColor,
            bubbleEndColor = theme.bubbleEndColor,
            bubbleTextColor = theme.bubbleTextColor,
            backdropStartColor = theme.backdropStartColor,
            backdropMidColor = theme.backdropMidColor,
            backdropEndColor = theme.backdropEndColor,
            inputFillColor = theme.inputFillColor,
            sendButtonColor = theme.sendButtonColor,
            avatarRes = avatarRes,
            remoteAvatar = remoteAvatar,
            avatarScale = if (remoteAvatar != null) 1f else resolver.scaleFor(assistant.id, avatarRes),
            avatarDescription = getString(R.string.assistant_avatar_content_description, assistant.displayName),
            closeDescription = getString(R.string.assistant_close),
            inputHint = getString(R.string.assistant_input_hint, assistant.displayName),
            sendLabel = getString(R.string.assistant_send),
            thinkingLabel = getString(R.string.assistant_sending),
            cancelLabel = getString(R.string.assistant_cancel),
            messageId = state.message?.id,
            messageText = state.message?.text,
            messageActions = state.message?.actions ?: emptyList(),
            messageRequiresAction = state.message?.requiresAction ?: false,
            inputText = inputState.text,
            isThinking = inputState.isThinking,
            submitting = inputState.submitting,
            failureText = failureText,
        )
    }


}
