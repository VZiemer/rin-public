package com.rinassistant.android.rin.localtools.focus

import com.rinassistant.android.rin.domain.model.AvatarState
import com.rinassistant.android.rin.localtools.focus.distraction.DistractionEvent

class FocusRinStateResolver(
    private val reactionWindowMillis: Long = DEFAULT_REACTION_WINDOW_MILLIS,
) {
    fun resolve(
        status: FocusStatus,
        distractionEvent: DistractionEvent?,
        nowMillis: Long,
    ): AvatarState {
        val activeDistractionEvent = distractionEvent?.takeIf { event ->
            nowMillis - event.detectedAtMillis <= reactionWindowMillis
        }
        return when {
            status == FocusStatus.PAUSED -> AvatarState.TIRED
            status == FocusStatus.CANCELLED -> AvatarState.TIRED
            status == FocusStatus.COMPLETED -> AvatarState.SOFT_SMILE
            activeDistractionEvent != null && activeDistractionEvent.sequenceNumber > 1 -> AvatarState.ANGRY_POUT
            activeDistractionEvent != null -> AvatarState.SCOLDING
            status == FocusStatus.RUNNING -> AvatarState.FOCUSED
            else -> AvatarState.NEUTRAL
        }
    }

    companion object {
        const val DEFAULT_REACTION_WINDOW_MILLIS = 15_000L
    }
}
