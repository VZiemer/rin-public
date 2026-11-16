package com.rinassistant.android.rin.notifications

enum class PushPresentation { IN_APP, OPEN_APP, NOTIFY }

data class PushScreenState(
    val interactive: Boolean,
    val locked: Boolean,
    val assistantVisible: Boolean,
    val homeVisible: Boolean,
    val canOpenFromBackground: Boolean,
    val focusActive: Boolean,
)

object PushPresentationPolicy {
    fun decide(screen: PushScreenState): PushPresentation = when {
        !screen.interactive || screen.locked || screen.focusActive -> PushPresentation.NOTIFY
        screen.assistantVisible -> PushPresentation.IN_APP
        screen.homeVisible && screen.canOpenFromBackground -> PushPresentation.OPEN_APP
        else -> PushPresentation.NOTIFY
    }
}
