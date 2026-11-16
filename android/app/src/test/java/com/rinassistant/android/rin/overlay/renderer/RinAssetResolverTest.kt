package com.rinassistant.android.rin.overlay.renderer

import com.rinassistant.android.R
import com.rinassistant.android.rin.domain.model.AvatarState
import com.rinassistant.android.rin.localtools.focus.FocusStatus
import org.junit.Assert.assertEquals
import org.junit.Test

class RinAssetResolverTest {
    private val resolver = RinAssetResolver()

    @Test
    fun mapsEveryAvatarStateToExpectedDrawable() {
        val expectedDrawables = mapOf(
            AvatarState.NEUTRAL to R.drawable.rin_01_neutral,
            AvatarState.SCOLDING to R.drawable.rin_02_scolding,
            AvatarState.SMUG to R.drawable.rin_07_soft_smile,
            AvatarState.EMBARRASSED to R.drawable.rin_04_embarrassed,
            AvatarState.ANGRY_POUT to R.drawable.rin_05_angry_pout,
            AvatarState.SURPRISED to R.drawable.rin_01_neutral,
            AvatarState.SOFT_SMILE to R.drawable.rin_07_soft_smile,
            AvatarState.FOCUSED to R.drawable.rin_08_focused,
            AvatarState.TIRED to R.drawable.rin_09_tired,
        )

        assertEquals(expectedDrawables.keys, expectedDrawables.keys.intersect(AvatarState.entries.toSet()))
        expectedDrawables.forEach { (state, drawable) ->
            assertEquals(drawable, resolver.drawableFor(state))
        }
    }

    @Test
    fun keepsTheNewPortraitAssetsAtTheSameScale() {
        assertEquals(1f, resolver.scaleFor(R.drawable.rin_01_neutral))
        assertEquals(1f, resolver.scaleFor(R.drawable.rin_02_scolding))
        assertEquals(1f, resolver.scaleFor(R.drawable.rin_08_focused))
        assertEquals(1f, resolver.scaleFor(R.drawable.rin_09_tired))
        assertEquals(1f, resolver.scaleFor(R.drawable.rin_pomodoro_running))
    }

    @Test
    fun fallsBackToFocusedAssetForRunningPomodoroWhenDedicatedAssetIsUnavailable() {
        assertEquals(
            R.drawable.rin_08_focused,
            resolver.focusDrawableFor(FocusStatus.RUNNING, AvatarState.FOCUSED),
        )
    }

    @Test
    fun fallsBackToTiredAssetForPausedPomodoroWhenDedicatedAssetIsUnavailable() {
        assertEquals(
            R.drawable.rin_09_tired,
            resolver.focusDrawableFor(FocusStatus.PAUSED, AvatarState.TIRED),
        )
    }

    @Test
    fun usesEmotionalAssetForDistractionReaction() {
        assertEquals(
            R.drawable.rin_02_scolding,
            resolver.focusDrawableFor(FocusStatus.RUNNING, AvatarState.SCOLDING),
        )
        assertEquals(
            R.drawable.rin_05_angry_pout,
            resolver.focusDrawableFor(FocusStatus.RUNNING, AvatarState.ANGRY_POUT),
        )
    }

    @Test
    fun keepsExpectedOptionalFocusAssetNames() {
        assertEquals("rin_pomodoro_running", FocusRinAssetVariant.POMODORO_RUNNING.resourceName)
        assertEquals("rin_pomodoro_long_pause", FocusRinAssetVariant.POMODORO_LONG_PAUSE.resourceName)
    }
}
