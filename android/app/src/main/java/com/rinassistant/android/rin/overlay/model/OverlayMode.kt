package com.rinassistant.android.rin.overlay.model

/**
 * Rin only has two on-screen presentations now:
 * - [OPEN]: the full-screen assistant panel (character + chat + quick actions + input).
 * - [FOCUS]: the Pomodoro focus overlay.
 *
 * When neither is visible Rin is "closed": no window is attached and only the discreet
 * status-bar icon (posted by the foreground service) remains.
 */
enum class OverlayMode {
    OPEN,
    FOCUS,
}
