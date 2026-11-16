package com.rinassistant.android.rin.notifications

import android.content.Context
import android.util.Log

/** Keeps the registration token in app-private storage; diagnostics never contain payloads. */
object RinFcmTokenStore {
    private const val PREFS = "rin_fcm"
    private const val TOKEN_KEY = "token"

    fun saveToken(context: Context, token: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(TOKEN_KEY, token).apply()
        Log.i(RinFirebaseMessagingService.TAG, "push_token_updated")
    }

    fun pendingToken(context: Context): String? =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(TOKEN_KEY, null)

    @Suppress("UNUSED_PARAMETER")
    fun saveError(context: Context, error: Throwable?) {
        Log.e(RinFirebaseMessagingService.TAG, "push_registration_failed")
    }

    @Suppress("UNUSED_PARAMETER")
    fun saveMessage(context: Context, from: String, title: String, body: String, data: Map<String, String>) {
        Log.i(RinFirebaseMessagingService.TAG, "push_received")
    }
}
