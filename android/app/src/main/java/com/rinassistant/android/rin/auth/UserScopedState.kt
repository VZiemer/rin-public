package com.rinassistant.android.rin.auth

data class ConversationKey(
    val userId: String,
    val assistantId: String,
    val conversationId: String,
)

class UserScopedState {
    private val conversations = mutableMapOf<String, ConversationKey>()
    private val caches = mutableMapOf<String, MutableMap<String, String>>()

    fun conversationKey(userId: String, assistantId: String, conversationId: String): ConversationKey {
        val key = ConversationKey(userId, assistantId, conversationId)
        conversations["$userId#$assistantId"] = key
        return key
    }

    fun currentConversation(userId: String, assistantId: String): ConversationKey? =
        conversations["$userId#$assistantId"]

    fun putCache(userId: String, name: String, value: String) {
        caches.getOrPut(userId) { mutableMapOf() }[name] = value
    }

    fun cache(userId: String, name: String): String? = caches[userId]?.get(name)

    fun clearUser(userId: String) {
        conversations.keys.filter { it.startsWith("$userId#") }.forEach(conversations::remove)
        caches.remove(userId)
    }
}
