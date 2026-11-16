package com.rinassistant.android.rin.overlay.controller

import android.content.Intent
import com.rinassistant.android.rin.domain.model.AvatarState
import com.rinassistant.android.rin.overlay.model.OverlayUiState
import com.rinassistant.android.rin.overlay.state.OverlayStateStore
import org.junit.Assert.assertEquals
import org.junit.Test

class OverlayControllerTest {
    @Test
    fun showReturnsMissingPermissionWhenOverlayPermissionIsDenied() {
        val windowController = FakeOverlayWindowController()
        val overlayController = OverlayController(
            overlayPermissionController = FakeOverlayPermissionController(canDrawOverlays = false),
            overlayWindowController = windowController,
            overlayStateStore = OverlayStateStore(),
        )

        val result = overlayController.show()

        assertEquals(OverlayCommandResult.MISSING_PERMISSION, result)
        assertEquals(0, windowController.attachCalls)
    }

    @Test
    fun showAttachesWindowWhenPermissionIsGranted() {
        val windowController = FakeOverlayWindowController()
        val overlayController = OverlayController(
            overlayPermissionController = FakeOverlayPermissionController(canDrawOverlays = true),
            overlayWindowController = windowController,
            overlayStateStore = OverlayStateStore(),
        )

        val result = overlayController.show()

        assertEquals(OverlayCommandResult.SHOWN, result)
        assertEquals(1, windowController.attachCalls)
    }

    @Test
    fun showDoesNotAttachTwice() {
        val windowController = FakeOverlayWindowController()
        val overlayController = OverlayController(
            overlayPermissionController = FakeOverlayPermissionController(canDrawOverlays = true),
            overlayWindowController = windowController,
            overlayStateStore = OverlayStateStore(),
        )

        overlayController.show()
        val result = overlayController.show()

        assertEquals(OverlayCommandResult.ALREADY_SHOWN, result)
        assertEquals(1, windowController.attachCalls)
    }

    @Test
    fun hideDetachesAttachedWindow() {
        val windowController = FakeOverlayWindowController()
        val overlayController = OverlayController(
            overlayPermissionController = FakeOverlayPermissionController(canDrawOverlays = true),
            overlayWindowController = windowController,
            overlayStateStore = OverlayStateStore(),
        )
        overlayController.show()

        val result = overlayController.hide()

        assertEquals(OverlayCommandResult.HIDDEN, result)
        assertEquals(1, windowController.detachCalls)
    }

    @Test
    fun updateAvatarStateUpdatesAttachedWindow() {
        val windowController = FakeOverlayWindowController()
        val overlayController = OverlayController(
            overlayPermissionController = FakeOverlayPermissionController(canDrawOverlays = true),
            overlayWindowController = windowController,
            overlayStateStore = OverlayStateStore(),
        )
        overlayController.show()

        val result = overlayController.updateAvatarState(AvatarState.SMUG)

        assertEquals(OverlayCommandResult.UPDATED, result)
        assertEquals(AvatarState.SMUG, windowController.lastState?.avatarState)
    }

    @Test
    fun updateAvatarStateKeepsSelectionWhenOverlayIsNotActive() {
        val stateStore = OverlayStateStore()
        val overlayController = OverlayController(
            overlayPermissionController = FakeOverlayPermissionController(canDrawOverlays = true),
            overlayWindowController = FakeOverlayWindowController(),
            overlayStateStore = stateStore,
        )

        val result = overlayController.updateAvatarState(AvatarState.TIRED)

        assertEquals(OverlayCommandResult.NOT_ACTIVE, result)
        assertEquals(AvatarState.TIRED, stateStore.state.value.avatarState)
    }

    private class FakeOverlayPermissionController(
        private val canDrawOverlays: Boolean,
    ) : OverlayPermissionController {
        override fun canDrawOverlays(): Boolean = canDrawOverlays

        override fun createPermissionIntent(): Intent =
            error("Permission intent is not needed for controller tests.")
    }

    private class FakeOverlayWindowController : OverlayWindowController {
        var attachCalls = 0
            private set
        var detachCalls = 0
            private set

        override var isAttached: Boolean = false
            private set

        var lastState: OverlayUiState? = null
            private set

        override fun attach(initialState: OverlayUiState) {
            attachCalls += 1
            lastState = initialState
            isAttached = true
        }

        override fun update(state: OverlayUiState) {
            lastState = state
        }

        override fun detach() {
            detachCalls += 1
            isAttached = false
        }
    }
}
