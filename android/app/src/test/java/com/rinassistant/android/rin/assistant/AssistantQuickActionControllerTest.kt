package com.rinassistant.android.rin.assistant

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test

class AssistantQuickActionControllerTest {
    @Test fun `local actions use local handlers and backend actions stay separate`() = runBlocking {
        val events = mutableListOf<String>()
        val controller = AssistantQuickActionController(
            { events.add("alarm") }, { events.add("focus") }, { events.add("settings") },
            { events.add(it.name) },
            { events.add("statements") },
        )
        AssistantQuickAction.entries.forEach { controller.select(it) }
        assertEquals(listOf("alarm", "focus", "TODAYS_TASKS", "ADD_REMINDER", "settings", "statements"), events)
    }
}
