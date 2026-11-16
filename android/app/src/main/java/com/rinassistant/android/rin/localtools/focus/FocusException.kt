package com.rinassistant.android.rin.localtools.focus

sealed class FocusException(message: String) : Exception(message) {
    data object NoActiveSession : FocusException("No focus session is active.")

    class InvalidStatus(
        expected: FocusStatus,
        actual: FocusStatus,
    ) : FocusException("Expected focus session status $expected but was $actual.")
}
