package com.rinassistant.android.rin.assistant

import com.rinassistant.android.R
import com.rinassistant.android.rin.domain.model.AvatarState

object AssistantCatalog {
    const val DEFAULT_ID = "RIN"

    val rin: AssistantDefinition = AssistantDefinition(
        id = DEFAULT_ID,
        displayName = "Rin",
        description = "Assistente direta e organizada.",
        theme = RinAssistantTheme,
        avatarAssets = AssistantAvatarAssets(
            fallback = R.drawable.rin_01_neutral,
            byState = mapOf(
                AvatarState.NEUTRAL to R.drawable.rin_01_neutral,
                AvatarState.SCOLDING to R.drawable.rin_02_scolding,
                AvatarState.EMBARRASSED to R.drawable.rin_04_embarrassed,
                AvatarState.ANGRY_POUT to R.drawable.rin_05_angry_pout,
                AvatarState.SOFT_SMILE to R.drawable.rin_07_soft_smile,
                AvatarState.FOCUSED to R.drawable.rin_08_focused,
                AvatarState.TIRED to R.drawable.rin_09_tired,
            ),
            aliases = mapOf(
                AvatarState.HAPPY to AvatarState.SOFT_SMILE,
                AvatarState.CONCERNED to AvatarState.SCOLDING,
                AvatarState.SMUG to AvatarState.SOFT_SMILE,
                AvatarState.SURPRISED to AvatarState.NEUTRAL,
            ),
            focusRunningName = "rin_pomodoro_running",
            focusPausedName = "rin_pomodoro_long_pause",
            focusRunningFallback = R.drawable.rin_08_focused,
            focusPausedFallback = R.drawable.rin_09_tired,
        ),
    )

    val yui: AssistantDefinition = AssistantDefinition(
        id = "YUI",
        displayName = "Yui",
        description = "Companheira deredere, proativa e encorajadora.",
        theme = YuiAssistantTheme,
        avatarAssets = AssistantAvatarAssets(
            fallback = R.drawable.yui_01_neutral,
            byState = mapOf(
                AvatarState.NEUTRAL to R.drawable.yui_01_neutral,
                AvatarState.HAPPY to R.drawable.yui_02_happy,
                AvatarState.CONCERNED to R.drawable.yui_03_concerned,
                AvatarState.FOCUSED to R.drawable.yui_04_focused,
                AvatarState.SOFT_SMILE to R.drawable.yui_05_encouraging,
                AvatarState.EMBARRASSED to R.drawable.yui_06_shy,
                AvatarState.TIRED to R.drawable.yui_07_tired,
                AvatarState.SURPRISED to R.drawable.yui_08_surprised,
            ),
            aliases = mapOf(
                AvatarState.SCOLDING to AvatarState.CONCERNED,
                AvatarState.SMUG to AvatarState.HAPPY,
                AvatarState.ANGRY_POUT to AvatarState.CONCERNED,
            ),
            focusRunningFallback = R.drawable.yui_04_focused,
            focusPausedFallback = R.drawable.yui_07_tired,
        ),
    )

    fun all(): List<AssistantDefinition> = listOf(rin, yui)

    fun getById(id: String?): AssistantDefinition? =
        all().find { it.id.equals(id?.trim(), ignoreCase = true) }

    fun requireById(id: String?): AssistantDefinition = getById(id) ?: rin
}
