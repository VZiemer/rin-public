package com.rinassistant.android.rin.notifications

import com.rinassistant.android.rin.domain.model.RinAction
import com.rinassistant.android.rin.domain.model.RinActionDescriptor
import com.rinassistant.android.rin.domain.model.RinMessage
import com.rinassistant.android.rin.domain.model.RinPriority
import com.rinassistant.android.rin.domain.model.AvatarState
import java.util.UUID

class RinBackendMessageMapper {
    fun map(data: Map<String, String>, fallbackBody: String): RinMessage =
        RinMessage(
            id = data["id"].orEmpty().ifBlank { "fcm-${UUID.randomUUID()}" },
            text = data["message"].orEmpty().ifBlank { data["body"].orEmpty().ifBlank { fallbackBody } },
            avatarState = data["avatarState"].toAvatarState(),
            priority = data["priority"].toRinPriority(),
            actions = data["actions"].toActionDescriptors(),
            assistantId = data["assistantId"].orEmpty().ifBlank { "RIN" }.trim().uppercase(),
        )

    private fun String?.toAvatarState(): AvatarState =
        when (normalize()) {
            "neutral" -> AvatarState.NEUTRAL
            "scolding" -> AvatarState.SCOLDING
            "smug" -> AvatarState.SMUG
            "embarrassed" -> AvatarState.EMBARRASSED
            "angry_pout", "angrypout", "angry", "pout" -> AvatarState.ANGRY_POUT
            "surprised" -> AvatarState.SURPRISED
            "soft_smile", "softsmile", "smile" -> AvatarState.SOFT_SMILE
            "happy" -> AvatarState.HAPPY
            "concerned", "worried" -> AvatarState.CONCERNED
            "focused", "focus" -> AvatarState.FOCUSED
            "tired" -> AvatarState.TIRED
            else -> AvatarState.NEUTRAL
        }

    private fun String?.toRinPriority(): RinPriority =
        when (normalize()) {
            "low" -> RinPriority.LOW
            "high" -> RinPriority.HIGH
            "critical" -> RinPriority.CRITICAL
            else -> RinPriority.NORMAL
        }

    private fun String?.toActionDescriptors(): List<RinActionDescriptor> {
        val value = orEmpty().trim()
        if (value.isBlank() || value == "[]") {
            return emptyList()
        }

        return value.split(",")
            .mapNotNull { actionName -> actionName.trim().trim('[', ']', '"', '\'').toActionDescriptor() }
            .take(RinMessage.MAX_ACTIONS)
    }

    private fun String.toActionDescriptor(): RinActionDescriptor? =
        when (normalize()) {
            "dismiss" -> RinActionDescriptor(
                id = "dismiss",
                label = "OK",
                action = RinAction.Dismiss,
            )
            "open", "open_app", "openapp" -> RinActionDescriptor(
                id = "open",
                label = "Abrir",
                action = RinAction.OpenApp,
            )
            "snooze" -> RinActionDescriptor(
                id = "snooze",
                label = "10 min",
                action = RinAction.Snooze(minutes = 10),
            )
            else -> null
        }

    private fun String?.normalize(): String =
        orEmpty().trim().lowercase().replace("-", "_").replace(" ", "_")
}
