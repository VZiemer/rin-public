package com.rinassistant.android.rin.assistant

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

private val Context.assistantPreferencesDataStore by preferencesDataStore(name = "assistant_preferences")

class DataStoreAssistantSelectionStore(
    context: Context,
    scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
) : AssistantSelectionStore {
    private val appContext = context.applicationContext

    override val selectedAssistantId: StateFlow<String> = appContext.assistantPreferencesDataStore.data
        .map { preferences ->
            AssistantCatalog.requireById(preferences[SELECTED_ASSISTANT_ID]).id
        }
        .stateIn(scope, SharingStarted.Eagerly, AssistantCatalog.DEFAULT_ID)

    override suspend fun setSelectedAssistantId(assistantId: String) {
        val resolved = AssistantCatalog.requireById(assistantId).id
        appContext.assistantPreferencesDataStore.edit { preferences ->
            preferences[SELECTED_ASSISTANT_ID] = resolved
        }
    }

    companion object {
        private val SELECTED_ASSISTANT_ID = stringPreferencesKey("selected_assistant_id")
    }
}
