package com.rinassistant.android.rin.notifications

import org.json.JSONObject
import java.util.UUID

data class PendingPush(val token: String, val userId: String, val data: Map<String, String>, val body: String) {
    fun encode(): String = JSONObject().put("token", token).put("userId", userId)
        .put("data", JSONObject(data)).put("body", body).toString()

    fun belongsTo(token: String?, userId: String?) = this.token == token && this.userId == userId

    companion object {
        fun create(userId: String, data: Map<String, String>, body: String): PendingPush {
            val id = data["id"]?.takeIf { it.isNotBlank() } ?: "fcm-${UUID.randomUUID()}"
            return PendingPush(UUID.randomUUID().toString(), userId, data + ("id" to id), body)
        }

        fun decode(value: String?): PendingPush? = try {
            val json = JSONObject(requireNotNull(value))
            val data = json.getJSONObject("data")
            PendingPush(json.getString("token"), json.getString("userId"),
                data.keys().asSequence().associateWith { data.getString(it) }, json.getString("body"))
        } catch (_: Exception) { null }
    }
}
