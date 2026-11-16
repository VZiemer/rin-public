package com.rinassistant.android.rin.actions

import com.rinassistant.android.rin.domain.model.RinAction
import com.rinassistant.android.rin.domain.model.RinMessage
import com.rinassistant.android.rin.domain.model.RinPriority
import com.rinassistant.android.rin.domain.model.AvatarState
import com.rinassistant.android.rin.localtools.focus.FocusController
import com.rinassistant.android.rin.localtools.focus.FocusStatus
import com.rinassistant.android.rin.localtools.focus.InMemoryFocusRepository
import com.rinassistant.android.rin.localtools.focus.MutableFocusClock
import com.rinassistant.android.rin.localtools.focus.StartFocusSessionInput
import com.rinassistant.android.rin.overlay.state.OverlayStateStore
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class LocalRinActionHandlerTest {
    @Test
    fun dismissClearsCurrentMessage() = runBlocking {
        val store = OverlayStateStore()
        store.showMessage(sampleMessage())
        val handler = LocalRinActionHandler(
            overlayStateStore = store,
            appLauncher = RecordingAppLauncher(),
            focusController = createFocusController(),
        )

        handler.handle(RinAction.Dismiss)

        assertEquals(null, store.state.value.message)
    }

    @Test
    fun snoozeClearsCurrentMessageWithoutOpeningApp() = runBlocking {
        val store = OverlayStateStore()
        val appLauncher = RecordingAppLauncher()
        store.showMessage(sampleMessage())
        val handler = LocalRinActionHandler(
            overlayStateStore = store,
            appLauncher = appLauncher,
            focusController = createFocusController(),
        )

        handler.handle(RinAction.Snooze(minutes = 10))

        assertEquals(null, store.state.value.message)
        assertFalse(appLauncher.opened)
    }

    @Test
    fun openAppClearsCurrentMessageAndLaunchesApp() = runBlocking {
        val store = OverlayStateStore()
        val appLauncher = RecordingAppLauncher()
        store.showMessage(sampleMessage())
        val handler = LocalRinActionHandler(
            overlayStateStore = store,
            appLauncher = appLauncher,
            focusController = createFocusController(),
        )

        handler.handle(RinAction.OpenApp)

        assertEquals(null, store.state.value.message)
        assertEquals(true, appLauncher.opened)
    }

    @Test
    fun pauseFocusPausesActiveFocusSession() = runBlocking {
        val focusRepository = InMemoryFocusRepository()
        val focusController = createFocusController(focusRepository)
        focusController.start(StartFocusSessionInput(durationMinutes = 1))
        val handler = LocalRinActionHandler(
            overlayStateStore = OverlayStateStore(),
            appLauncher = RecordingAppLauncher(),
            focusController = focusController,
        )

        handler.handle(RinAction.PauseFocus)

        assertEquals(FocusStatus.PAUSED, focusRepository.currentSession.value?.status)
    }

    private fun sampleMessage(): RinMessage =
        RinMessage(
            id = "message",
            text = "Hello",
            avatarState = AvatarState.NEUTRAL,
            priority = RinPriority.NORMAL,
            actions = emptyList(),
        )

    private fun createFocusController(
        repository: InMemoryFocusRepository = InMemoryFocusRepository(),
    ): FocusController =
        FocusController(
            repository = repository,
            clock = MutableFocusClock(now = 1_000L),
            idProvider = { "focus" },
        )

    private class RecordingAppLauncher : RinAppLauncher {
        var opened = false
            private set

        override fun openApp() {
            opened = true
        }
    }
}
