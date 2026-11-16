package com.rinassistant.android.rin.auth

import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ConversationScopeTest {
    @Test
    fun switchingUserOrAssistantStartsANewConversationContext() {
        val state = UserScopedState()
        val rinA = state.conversationKey("user-a", "RIN", "conv-1")
        val yuiA = state.conversationKey("user-a", "YUI", "conv-1")
        val rinB = state.conversationKey("user-b", "RIN", "conv-1")
        assertNotEquals(rinA, yuiA)
        assertNotEquals(rinA, rinB)
        state.clearUser("user-a")
        assertNull(state.currentConversation("user-a", "RIN"))
    }
}
