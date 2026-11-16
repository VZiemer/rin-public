package com.rinassistant.android.rin.assistant

/**
 * Visual tokens for an assistant. Colors are ARGB longs so the model stays
 * independent from Compose/View color types.
 */
data class AssistantTheme(
    val primaryColor: Long,
    val secondaryColor: Long,
    val accentColor: Long,
    val bubbleStartColor: Long,
    val bubbleEndColor: Long,
    val bubbleTextColor: Long,
    val backdropStartColor: Long,
    val backdropMidColor: Long,
    val backdropEndColor: Long,
    val inputFillColor: Long,
    val sendButtonColor: Long,
)

val RinAssistantTheme = AssistantTheme(
    primaryColor = 0xFF7C3AED,
    secondaryColor = 0xFF6D28D9,
    accentColor = 0xFFB794F6,
    bubbleStartColor = 0xFF7C3AED,
    bubbleEndColor = 0xFF6D28D9,
    bubbleTextColor = 0xFFFFFFFF,
    backdropStartColor = 0xF20B1026,
    backdropMidColor = 0xF21A1440,
    backdropEndColor = 0xF2120A2E,
    inputFillColor = 0x1FFFFFFF,
    sendButtonColor = 0xFF7C3AED,
)

val YuiAssistantTheme = AssistantTheme(
    primaryColor = 0xFFFF7043,
    secondaryColor = 0xFFFF8A65,
    accentColor = 0xFFFFB74D,
    bubbleStartColor = 0xFFFF7043,
    bubbleEndColor = 0xFFF4511E,
    bubbleTextColor = 0xFFFFFFFF,
    backdropStartColor = 0xF2261410,
    backdropMidColor = 0xF23D1F16,
    backdropEndColor = 0xF21A0E0C,
    inputFillColor = 0x1FFFFFFF,
    sendButtonColor = 0xFFFF7043,
)
