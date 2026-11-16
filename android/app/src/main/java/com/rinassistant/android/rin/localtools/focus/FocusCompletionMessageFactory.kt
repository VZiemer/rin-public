package com.rinassistant.android.rin.localtools.focus

import com.rinassistant.android.rin.domain.model.RinMessage
import com.rinassistant.android.rin.domain.model.RinPriority
import com.rinassistant.android.rin.domain.model.AvatarState

class FocusCompletionMessageFactory {
    fun create(messageText: String): RinMessage =
        RinMessage(
            id = MESSAGE_ID,
            text = messageText,
            avatarState = AvatarState.SOFT_SMILE,
            priority = RinPriority.NORMAL,
            actions = emptyList(),
        )

    companion object {
        const val MESSAGE_ID = "focus-completed"
    }
}
