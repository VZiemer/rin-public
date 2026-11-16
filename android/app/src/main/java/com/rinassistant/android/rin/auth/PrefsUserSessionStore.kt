package com.rinassistant.android.rin.auth

import android.content.Context

class PrefsUserSessionStore(context: Context) : UserSessionStore {
    private val prefs = context.applicationContext.getSharedPreferences("rin_user_session", Context.MODE_PRIVATE)

    override fun save(session: UserSession) {
        prefs.edit()
            .putString("userId", session.userId)
            .putString("defaultAssistantId", session.defaultAssistantId)
            .apply()
    }

    override fun read(): UserSession? {
        val userId = prefs.getString("userId", null) ?: return null
        return UserSession(userId, prefs.getString("defaultAssistantId", "RIN") ?: "RIN")
    }

    override fun clear() {
        prefs.edit().clear().apply()
    }
}
