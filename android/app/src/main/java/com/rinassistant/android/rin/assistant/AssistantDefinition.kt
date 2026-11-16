package com.rinassistant.android.rin.assistant

data class AssistantDefinition(
    val id: String,
    val displayName: String,
    val theme: AssistantTheme,
    val avatarAssets: AssistantAvatarAssets,
    val description: String = "",
)
