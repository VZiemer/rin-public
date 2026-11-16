package com.rinassistant.android.rin.localtools.focus

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first

private val Context.focusSessionDataStore by preferencesDataStore(name = "focus_session")

class DataStoreFocusSessionStorage(
    private val context: Context,
) : FocusSessionStorage {
    override suspend fun save(session: FocusSession) {
        context.focusSessionDataStore.edit { preferences ->
            preferences[SESSION_ID] = session.id
            preferences[DURATION_MILLIS] = session.durationMillis
            preferences[STARTED_AT_MILLIS] = session.startedAtMillis
            preferences[ENDS_AT_MILLIS] = session.endsAtMillis
            preferences[STATUS] = session.status.name
            session.pausedAtMillis?.let { pausedAt ->
                preferences[PAUSED_AT_MILLIS] = pausedAt
            } ?: preferences.remove(PAUSED_AT_MILLIS)
        }
    }

    override suspend fun load(): FocusSession? {
        val preferences = context.focusSessionDataStore.data.first()
        val id = preferences[SESSION_ID] ?: return null
        val durationMillis = preferences[DURATION_MILLIS] ?: return null
        val startedAtMillis = preferences[STARTED_AT_MILLIS] ?: return null
        val endsAtMillis = preferences[ENDS_AT_MILLIS] ?: return null
        val statusName = preferences[STATUS] ?: return null
        val status = runCatching { FocusStatus.valueOf(statusName) }.getOrNull() ?: return null
        return FocusSession(
            id = id,
            durationMillis = durationMillis,
            startedAtMillis = startedAtMillis,
            endsAtMillis = endsAtMillis,
            status = status,
            pausedAtMillis = preferences[PAUSED_AT_MILLIS],
        )
    }

    override suspend fun clear() {
        context.focusSessionDataStore.edit { preferences ->
            preferences.clear()
        }
    }

    private companion object {
        val SESSION_ID = stringPreferencesKey("session_id")
        val DURATION_MILLIS = longPreferencesKey("duration_millis")
        val STARTED_AT_MILLIS = longPreferencesKey("started_at_millis")
        val ENDS_AT_MILLIS = longPreferencesKey("ends_at_millis")
        val STATUS = stringPreferencesKey("status")
        val PAUSED_AT_MILLIS = longPreferencesKey("paused_at_millis")
    }
}
