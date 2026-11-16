package com.rinassistant.android.rin.notifications

import org.junit.Assert.*
import org.junit.Test

class PendingPushTest {
    @Test fun serializationPreservesMessageActionsAndStableId() {
        val push = PendingPush.create("user", mapOf("message" to "Olá!", "actions" to "dismiss", "assistantId" to "YUI"), "body")
        val restored = PendingPush.decode(push.encode())!!
        assertEquals(push, restored)
        assertEquals(RinBackendMessageMapper().map(push.data, push.body), RinBackendMessageMapper().map(restored.data, restored.body))
    }
    @Test fun doesNotExposeAnotherUsersMessageOrAcceptAnUnknownToken() {
        val push = PendingPush.create("user", emptyMap(), "body")
        assertTrue(push.belongsTo(push.token, "user"))
        assertFalse(push.belongsTo(push.token, "other"))
        assertFalse(push.belongsTo("forged", "user"))
        assertFalse(push.belongsTo(push.token, null))
    }
    @Test fun corruptStorageIsIgnored() {
        assertNull(PendingPush.decode("not json"))
        assertNull(PendingPush.decode(null))
    }
    @Test fun backendMessageIdIsPreserved() {
        assertEquals("backend-id", PendingPush.create("user", mapOf("id" to "backend-id"), "body").data["id"])
    }
}
