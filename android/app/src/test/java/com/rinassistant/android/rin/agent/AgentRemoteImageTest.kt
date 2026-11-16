package com.rinassistant.android.rin.agent

import org.junit.Assert.*
import org.junit.Test

class AgentRemoteImageTest {
    @Test fun decodesImageSelectionFromChatResponse() {
        assertEquals("rin_halloween_v1", AgentJson.decode(
            """{"message":"Boo!","imageName":"rin_halloween_v1"}""",
        ).imageName)
    }

    @Test fun omittedAndNullLeaveSelectionUnchangedWhileEmptyResetsIt() {
        assertNull(AgentJson.decode("""{"message":"oi"}""").imageName)
        assertNull(AgentJson.decode("""{"message":"oi","imageName":null}""").imageName)
        assertEquals("", AgentJson.decode("""{"message":"oi","imageName":""}""").imageName)
    }

    @Test fun rejectsNonStringSelection() {
        assertThrows(AgentException::class.java) { AgentJson.decode("""{"message":"oi","imageName":42}""") }
    }
}
