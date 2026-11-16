package com.rinassistant.android.rin.assistant

import com.rinassistant.android.rin.domain.model.AvatarState
import com.rinassistant.android.rin.domain.model.RinMessage
import com.rinassistant.android.rin.domain.model.RinPriority
import com.rinassistant.android.rin.localtools.focus.FocusStatus
import com.rinassistant.android.rin.notifications.RinBackendMessageMapper
import com.rinassistant.android.rin.overlay.model.FocusOverlayPresentation
import com.rinassistant.android.rin.overlay.model.OverlayMode
import com.rinassistant.android.rin.overlay.renderer.AssistantAssetResolver
import com.rinassistant.android.rin.overlay.state.OverlayStateStore
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MultiAssistantHardeningTest {
    @Test
    fun staleSelectionMissingAssetsAndOldPushesStaySafe() = runBlocking {
        val store = InMemoryAssistantSelectionStore("NOPE")
        assertEquals(AssistantCatalog.DEFAULT_ID, store.selectedAssistantId.value)

        val resolver = AssistantAssetResolver()
        assertTrue(resolver.drawableFor("RIN", AvatarState.HAPPY) != 0)
        assertTrue(resolver.drawableFor("YUI", AvatarState.SMUG) != 0)
        assertEquals(
            resolver.drawableFor("YUI", AvatarState.HAPPY),
            resolver.drawableFor("YUI", AvatarState.SMUG),
        )

        val overlay = OverlayStateStore()
        overlay.setSelectedAssistant("RIN")
        overlay.showFocusPresentation(
            FocusOverlayPresentation("25:00", FocusStatus.RUNNING, "Focus"),
            AvatarState.FOCUSED,
        )
        overlay.setSelectedAssistant("YUI")
        assertEquals(OverlayMode.FOCUS, overlay.state.value.mode)
        assertEquals("YUI", overlay.state.value.selectedAssistantId)

        val push = RinBackendMessageMapper().map(
            mapOf("message" to "Oi", "avatarState" to "HAPPY"),
            "fallback",
        )
        assertEquals("RIN", push.assistantId)
        val yuiMessage = RinMessage(
            "p",
            "from yui",
            AvatarState.HAPPY,
            RinPriority.NORMAL,
            emptyList(),
            assistantId = "YUI",
        )
        overlay.showMessage(yuiMessage)
        assertEquals(listOf(yuiMessage), overlay.state.value.pendingMessages)
        overlay.clearFocusPresentation()
        assertEquals("YUI", overlay.state.value.presentationAssistantId)
        assertNotEquals(
            resolver.drawableFor("RIN", AvatarState.NEUTRAL),
            resolver.drawableFor(overlay.state.value.visibleAssistantId, AvatarState.NEUTRAL),
        )
    }
}
