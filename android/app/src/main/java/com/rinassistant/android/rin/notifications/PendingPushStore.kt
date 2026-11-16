package com.rinassistant.android.rin.notifications

import android.content.Context

class PendingPushStore(context: Context) {
    private val prefs = context.getSharedPreferences("rin_pending_push", Context.MODE_PRIVATE)
    fun save(push: PendingPush) { check(prefs.edit().putString("pending", push.encode()).commit()) }
    fun read(): PendingPush? = PendingPush.decode(prefs.getString("pending", null))
    fun clear(token: String) {
        if (read()?.token == token) prefs.edit().remove("pending").commit()
    }
}
