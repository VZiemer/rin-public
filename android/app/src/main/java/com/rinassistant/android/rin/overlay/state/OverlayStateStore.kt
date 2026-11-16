package com.rinassistant.android.rin.overlay.state

import com.rinassistant.android.rin.domain.model.RinMessage
import com.rinassistant.android.rin.domain.model.AvatarState
import com.rinassistant.android.rin.overlay.model.FocusOverlayPresentation
import com.rinassistant.android.rin.overlay.model.OverlayMode
import com.rinassistant.android.rin.overlay.model.OverlayUiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

class OverlayStateStore(
    initialState: OverlayUiState = OverlayUiState(),
) {
    private val mutableState = MutableStateFlow(initialState)
    val state: StateFlow<OverlayUiState> = mutableState.asStateFlow()

    /** Opens the assistant panel (unless a focus session overlay is currently showing). */
    fun show() {
        mutableState.update { currentState ->
            if (currentState.mode == OverlayMode.FOCUS) currentState.copy(isVisible = true)
            else currentState.copy(isVisible = true, mode = OverlayMode.OPEN)
        }
    }

    /** Closes the assistant panel. Never cancels an active focus session overlay. */
    fun hide() {
        mutableState.update { currentState ->
            if (currentState.mode == OverlayMode.FOCUS) currentState
            else currentState.copy(
                isVisible = false,
                mode = OverlayMode.OPEN,
                message = null,
                pendingMessages = emptyList(),
                avatarState = AvatarState.NEUTRAL,
                presentationAssistantId = null,
            )
        }
    }

    fun changeAvatarState(state: AvatarState) {
        mutableState.update { currentState ->
            currentState.copy(avatarState = state)
        }
    }

    fun setSelectedAssistant(assistantId: String) {
        mutableState.update { currentState ->
            currentState.copy(selectedAssistantId = assistantId)
        }
    }

    /** A new message from Rin: opens the panel and shows it in her speech bubble. */
    fun showMessage(message: RinMessage) {
        mutableState.update { currentState ->
            if (currentState.message?.id == message.id || currentState.pendingMessages.any { it.id == message.id }) return@update currentState
            if (currentState.mode == OverlayMode.FOCUS || currentState.message?.requiresAction == true) {
                return@update currentState.copy(pendingMessages = currentState.pendingMessages + message)
            }
            currentState.copy(
                isVisible = true,
                mode = OverlayMode.OPEN,
                avatarState = message.avatarState,
                presentationAssistantId = message.assistantId,
                message = message,
                focusPresentation = null,
            )
        }
    }

    /** Closes the panel entirely (used by the backdrop tap / opening Settings). */
    fun dismissAssistant() = hide()

    fun clearMessage() {
        mutableState.update { currentState ->
            if (currentState.message == null || currentState.mode == OverlayMode.FOCUS) currentState else currentState.afterMessageCleared()
        }
    }

    /** A new chat request replaces the displayed reply without consuming queued notifications. */
    fun clearPreviousReply() {
        mutableState.update { state ->
            if (state.mode == OverlayMode.FOCUS) state else state.copy(
                message = null,
                presentationAssistantId = null,
                avatarState = AvatarState.NEUTRAL,
            )
        }
    }

    fun dismissMessageOnTap(messageId: String) {
        mutableState.update { currentState ->
            val message = currentState.message
            if (message == null || message.id != messageId || message.requiresAction) {
                currentState
            } else {
                currentState.afterMessageCleared()
            }
        }
    }

    fun showFocusPresentation(
        presentation: FocusOverlayPresentation,
        avatarState: AvatarState,
    ) {
        mutableState.update { currentState ->
            currentState.copy(
                isVisible = true,
                mode = OverlayMode.FOCUS,
                pendingMessages = if (currentState.mode != OverlayMode.FOCUS && currentState.message != null)
                    listOf(currentState.message) + currentState.pendingMessages else currentState.pendingMessages,
                avatarState = avatarState,
                message = null,
                focusPresentation = presentation,
            )
        }
    }

    fun clearFocusPresentation() {
        mutableState.update { currentState ->
            if (currentState.mode != OverlayMode.FOCUS) return@update currentState
            val next = currentState.pendingMessages.firstOrNull()
            if (next != null) {
                currentState.copy(
                    mode = OverlayMode.OPEN,
                    isVisible = true,
                    message = next,
                    pendingMessages = currentState.pendingMessages.drop(1),
                    avatarState = next.avatarState,
                    presentationAssistantId = next.assistantId,
                    focusPresentation = null,
                )
            } else {
                currentState.copy(
                    mode = OverlayMode.OPEN,
                    isVisible = false,
                    message = null,
                    avatarState = AvatarState.NEUTRAL,
                    presentationAssistantId = null,
                    focusPresentation = null,
                )
            }
        }
    }

    private fun OverlayUiState.afterMessageCleared(): OverlayUiState {
        val next = pendingMessages.firstOrNull()
        return copy(
            message = next,
            pendingMessages = pendingMessages.drop(1),
            avatarState = next?.avatarState ?: AvatarState.NEUTRAL,
            presentationAssistantId = next?.assistantId,
        )
    }
}
