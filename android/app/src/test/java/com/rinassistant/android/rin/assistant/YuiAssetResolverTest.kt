package com.rinassistant.android.rin.assistant

import com.rinassistant.android.R
import com.rinassistant.android.rin.domain.model.AvatarState
import com.rinassistant.android.rin.overlay.renderer.AssistantAssetResolver
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class YuiAssetResolverTest {
    private val resolver = AssistantAssetResolver()

    @Test
    fun mapsYuiStatesAndUnsupportedStatesThroughAssetsNotPresentationBranches() {
        assertEquals(R.drawable.yui_01_neutral, resolver.drawableFor("YUI", AvatarState.NEUTRAL))
        assertEquals(R.drawable.yui_02_happy, resolver.drawableFor("YUI", AvatarState.HAPPY))
        assertEquals(R.drawable.yui_03_concerned, resolver.drawableFor("YUI", AvatarState.CONCERNED))
        assertEquals(R.drawable.yui_04_focused, resolver.drawableFor("YUI", AvatarState.FOCUSED))
        assertEquals(R.drawable.yui_05_encouraging, resolver.drawableFor("YUI", AvatarState.SOFT_SMILE))
        assertEquals(R.drawable.yui_06_shy, resolver.drawableFor("YUI", AvatarState.EMBARRASSED))
        assertEquals(R.drawable.yui_07_tired, resolver.drawableFor("YUI", AvatarState.TIRED))
        assertEquals(R.drawable.yui_08_surprised, resolver.drawableFor("YUI", AvatarState.SURPRISED))
        assertEquals(R.drawable.yui_03_concerned, resolver.drawableFor("YUI", AvatarState.SCOLDING))
        assertEquals(R.drawable.yui_02_happy, resolver.drawableFor("YUI", AvatarState.SMUG))
        assertNotEquals(
            resolver.drawableFor("RIN", AvatarState.NEUTRAL),
            resolver.drawableFor("YUI", AvatarState.NEUTRAL),
        )
        assertNotEquals(RinAssistantTheme, YuiAssistantTheme)
    }
}
