package com.rinassistant.android.rin.agent

import com.rinassistant.android.rin.domain.model.*
import com.rinassistant.android.rin.overlay.state.OverlayStateStore
import com.rinassistant.android.rin.overlay.model.OverlayMode
import org.junit.Assert.*
import org.junit.Test

class AgentResponseMapperTest {
    @Test fun `known states render and unknown states fall back safely`() {
        val mapper = AgentResponseMapper()
        AvatarState.entries.forEach { state ->
            assertEquals(state, mapper.map(AgentMessageResponse("Hi", state.name, "NORMAL", emptyList())).avatarState)
        }
        val unknown = mapper.map(AgentMessageResponse("Hi", "INVALID", "INVALID", emptyList()))
        assertEquals(AvatarState.NEUTRAL, unknown.avatarState)
        assertEquals(RinPriority.NORMAL, unknown.priority)
    }
    @Test fun `assistant response opens the panel and keeps it open after dismissal`() {
        val store = OverlayStateStore()
        val message = AgentResponseMapper().map(AgentMessageResponse("Hello", "SMUG", "NORMAL", emptyList()))
        store.showMessage(message)
        assertEquals(OverlayMode.OPEN, store.state.value.mode)
        assertTrue(store.state.value.isVisible)
        assertEquals(AvatarState.SMUG, store.state.value.avatarState)
        store.dismissMessageOnTap(message.id)
        assertEquals(OverlayMode.OPEN, store.state.value.mode)
        assertTrue(store.state.value.isVisible)
        assertNull(store.state.value.message)
    }
}
