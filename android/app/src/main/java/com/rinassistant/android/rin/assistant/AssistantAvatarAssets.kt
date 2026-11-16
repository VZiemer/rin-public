package com.rinassistant.android.rin.assistant

import androidx.annotation.DrawableRes
import com.rinassistant.android.rin.domain.model.AvatarState

data class AssistantAvatarAssets(
    @DrawableRes val fallback: Int,
    val byState: Map<AvatarState, Int>,
    val aliases: Map<AvatarState, AvatarState> = emptyMap(),
    val sittingDrawables: Set<Int> = emptySet(),
    val sittingScale: Float = 0.52f,
    val focusRunningName: String? = null,
    val focusPausedName: String? = null,
    @DrawableRes val focusRunningFallback: Int,
    @DrawableRes val focusPausedFallback: Int,
) {
    fun resolveState(state: AvatarState): AvatarState = aliases[state] ?: state

    @DrawableRes
    fun drawableFor(state: AvatarState): Int = byState[resolveState(state)] ?: fallback
}
