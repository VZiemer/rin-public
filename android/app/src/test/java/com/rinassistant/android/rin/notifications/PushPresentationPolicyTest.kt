package com.rinassistant.android.rin.notifications

import org.junit.Assert.assertEquals
import org.junit.Test

class PushPresentationPolicyTest {
    private val home = PushScreenState(true, false, false, true, true, false)

    @Test fun opensOnlyOnUnlockedHomeWithPermission() {
        assertEquals(PushPresentation.OPEN_APP, PushPresentationPolicy.decide(home))
        assertEquals(PushPresentation.NOTIFY, PushPresentationPolicy.decide(home.copy(canOpenFromBackground = false)))
    }
    @Test fun otherAppAndUnknownScreenOnlyNotify() {
        assertEquals(PushPresentation.NOTIFY, PushPresentationPolicy.decide(home.copy(homeVisible = false)))
    }
    @Test fun screenOffOrLockedNeverOpensEvenWithStaleVisibility() {
        assertEquals(PushPresentation.NOTIFY, PushPresentationPolicy.decide(home.copy(interactive = false, assistantVisible = true)))
        assertEquals(PushPresentation.NOTIFY, PushPresentationPolicy.decide(home.copy(locked = true, assistantVisible = true)))
    }
    @Test fun visibleChatReceivesMessageWithoutDuplicateNotification() {
        assertEquals(PushPresentation.IN_APP, PushPresentationPolicy.decide(home.copy(assistantVisible = true)))
    }
    @Test fun pomodoroIsNotInterruptedByOpeningChat() {
        assertEquals(PushPresentation.NOTIFY, PushPresentationPolicy.decide(home.copy(focusActive = true)))
    }
}
