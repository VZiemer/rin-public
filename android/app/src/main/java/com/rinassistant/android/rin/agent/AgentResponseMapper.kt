package com.rinassistant.android.rin.agent

import com.rinassistant.android.rin.domain.model.*
import java.util.Locale
import java.util.UUID

class AgentResponseMapper(private val actionLabel: (RinAction) -> String = { it.toString() }) {
    fun map(response: AgentMessageResponse): RinMessage = RinMessage(
        id = "agent-${UUID.randomUUID()}",
        text = response.message,
        avatarState = AvatarState.entries.find { it.name == response.avatarState.trim().uppercase(Locale.ROOT) } ?: AvatarState.NEUTRAL,
        priority = RinPriority.entries.find { it.name == response.priority.trim().uppercase(Locale.ROOT) } ?: RinPriority.NORMAL,
        actions = response.actions.mapIndexedNotNull { index, action ->
            AgentLocalActionMapper().map(action)?.let {
                RinActionDescriptor("agent-action-$index", actionLabel(it), it)
            }
        },
        assistantId = response.assistantId.ifBlank { "RIN" },
    )
}
