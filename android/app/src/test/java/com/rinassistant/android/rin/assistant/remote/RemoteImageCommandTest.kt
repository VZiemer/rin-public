package com.rinassistant.android.rin.assistant.remote

import org.junit.Assert.*
import org.junit.Test

class RemoteImageCommandTest {
    private fun available() = mapOf(
        "type" to RemoteImageCommand.AVAILABLE, "imageName" to "rin_halloween_v1",
        "imageUrl" to "https://example.com/rin.png?signature=abc", "imageSha256" to "a".repeat(64),
    )

    @Test fun acceptsSignedHttpsUrlAndDefaultsToRin() {
        val command = RemoteImageCommand.parse(available()) as RemoteImageCommand.Available
        assertEquals("RIN", command.assistantId)
        assertEquals("rin_halloween_v1", command.name)
        assertTrue(command.url.endsWith("?signature=abc"))
    }

    @Test fun emptySelectionRestoresLocalImagesAndNormalizesAssistant() {
        assertEquals(RemoteImageCommand.Select("YUI", ""), RemoteImageCommand.parse(mapOf(
            "type" to RemoteImageCommand.SELECT, "assistantId" to "yui", "imageName" to "",
        )))
    }

    @Test fun rejectsUnsafeNamesUrlsHashesAndUnknownAssistants() {
        val invalid = listOf(
            "imageName" to "../rin", "imageName" to "", "imageName" to "a/b",
            "imageUrl" to "http://example.com/rin.png", "imageUrl" to "file:///tmp/rin.png",
            "imageUrl" to "https://user:password@example.com/rin.png",
            "imageSha256" to "bad", "assistantId" to "UNKNOWN",
        )
        for ((key, value) in invalid) {
            assertThrows(Exception::class.java) { RemoteImageCommand.parse(available() + (key to value)) }
        }
    }

    @Test fun missingSelectionIsNotAnImplicitResetAndChatIsNotACommand() {
        assertThrows(Exception::class.java) { RemoteImageCommand.parse(mapOf("type" to RemoteImageCommand.SELECT)) }
        assertFalse(RemoteImageCommand.isCommand(mapOf("message" to "oi", "imageName" to "rin_halloween")))
    }
}
