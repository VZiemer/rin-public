package com.rinassistant.android.rin.auth

import com.rinassistant.android.rin.device.AuthenticatedDeviceRegistrar

class LogoutUseCase(
    private val auth: AuthRepository,
    private val users: UserSessionStore,
    private val devices: AuthenticatedDeviceRegistrar,
    private val onUserStateCleared: suspend () -> Unit = {},
) {
    suspend fun execute() {
        runCatching { devices.detach() }
        auth.signOut()
        users.clear()
        onUserStateCleared()
    }
}
