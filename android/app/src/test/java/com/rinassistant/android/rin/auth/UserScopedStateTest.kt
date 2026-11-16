package com.rinassistant.android.rin.auth

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class UserScopedStateTest {
    @Test
    fun scopesConversationByUserAndAssistant() {
        val state = UserScopedState()
        val a = state.conversationKey("user-a", "RIN", "c1")
        val b = state.conversationKey("user-b", "RIN", "c1")
        val yui = state.conversationKey("user-a", "YUI", "c1")
        assertEquals("user-a", a.userId)
        assertEquals("RIN", a.assistantId)
        assertEquals("c1", a.conversationId)
        assertEquals("user-b", b.userId)
        assertEquals("YUI", yui.assistantId)
        state.clearUser("user-a")
        assertNull(state.currentConversation("user-a", "RIN"))
        assertEquals(b, state.currentConversation("user-b", "RIN"))
    }
}
