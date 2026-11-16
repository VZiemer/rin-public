package com.rinassistant.android.rin.overlay.renderer

import com.rinassistant.android.R
import com.rinassistant.android.rin.assistant.AssistantCatalog
import com.rinassistant.android.rin.domain.model.AvatarState
import com.rinassistant.android.rin.localtools.focus.FocusStatus
import org.junit.Assert.assertEquals
import org.junit.Test

class AssistantAssetResolverTest {
    private val resolver = AssistantAssetResolver()

    @Test
    fun resolvesRinStatesByAssistantAndFallsBackToNeutral() {
        assertEquals(
            R.drawable.rin_02_scolding,
            resolver.drawableFor(AssistantCatalog.DEFAULT_ID, AvatarState.SCOLDING),
        )
        assertEquals(
            R.drawable.rin_02_scolding,
            resolver.drawableFor("NOPE", AvatarState.SCOLDING),
        )
        assertEquals(
            R.drawable.rin_01_neutral,
            resolver.drawableFor(AssistantCatalog.DEFAULT_ID, AvatarState.NEUTRAL),
        )
    }

    @Test
    fun keepsTheNewRinPortraitsAtTheSameScale() {
        assertEquals(1f, resolver.scaleFor("RIN", R.drawable.rin_01_neutral))
        assertEquals(
            1f,
            resolver.scaleFor("RIN", R.drawable.rin_08_focused),
        )
    }

    @Test
    fun usesEmotionalAssetsDuringFocusDistraction() {
        assertEquals(
            R.drawable.rin_02_scolding,
            resolver.focusDrawableFor("RIN", FocusStatus.RUNNING, AvatarState.SCOLDING),
        )
        assertEquals(
            R.drawable.rin_08_focused,
            resolver.focusDrawableFor("RIN", FocusStatus.RUNNING, AvatarState.FOCUSED),
        )
        assertEquals(
            R.drawable.rin_09_tired,
            resolver.focusDrawableFor("RIN", FocusStatus.PAUSED, AvatarState.TIRED),
        )
    }
}
