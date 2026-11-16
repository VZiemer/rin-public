package com.rinassistant.android.rin.notifications

import android.app.Notification
import android.app.NotificationManager
import android.content.Intent
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Test
import org.junit.Assert.*
import com.rinassistant.android.rin.app.RinApplication
import com.rinassistant.android.rin.ui.main.MainActivity

/** Run only on an unlocked development device with an existing session and notification/usage/overlay grants. */
@Suppress("DEPRECATION")
class PushDeliveryDeviceTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    @Test fun testNotificationAndHomeAndForegroundDelivery() {
        val context = instrumentation.targetContext
        val app = context.applicationContext as RinApplication
        val manager = context.getSystemService(NotificationManager::class.java)
        val presenter = RinPushPresenter(context)
        assertNotNull("Device must retain its signed-in user", app.appContainer.userSessionStore.read())
        context.startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        await { !app.mainWindowFocused && !AndroidPushScreenReader(context).read().homeVisible }
        SystemClock.sleep(700)
        assertEquals(PushPresentation.NOTIFY, presenter.present(mapOf("id" to "device-test-notification", "message" to "Teste de notificação da Rin."), "test"))
        await { manager.activeNotifications.any { it.id == RinPushPresenter.NOTIFICATION_ID } }
        val notification = manager.activeNotifications.first { it.id == RinPushPresenter.NOTIFICATION_ID }.notification
        assertEquals("Rin", notification.extras.getString(Notification.EXTRA_TITLE))
        assertTrue(notification.extras.getString(Notification.EXTRA_TEXT)!!.contains("preciso falar com você"))
        assertNotNull(notification.getLargeIcon())
        assertNotNull(PendingPushStore(context).read())
        notification.contentIntent.send()
        await { app.mainWindowFocused && app.assistantPanelVisible && app.appContainer.overlayStateStore.state.value.message?.id == "device-test-notification" }
        assertNull(PendingPushStore(context).read())
        assertEquals(PushPresentation.IN_APP, presenter.present(mapOf("id" to "device-test-in-app", "message" to "Teste no chat aberto."), "test"))
        assertEquals("device-test-in-app", app.appContainer.overlayStateStore.state.value.message?.id)
        assertFalse(manager.activeNotifications.any { it.id == RinPushPresenter.NOTIFICATION_ID })

        shell("input keyevent KEYCODE_HOME")
        await { AndroidPushScreenReader(context).read().homeVisible }
        assertEquals(PushPresentation.OPEN_APP, presenter.present(mapOf("id" to "device-test-home", "message" to "Teste de abertura pela tela inicial."), "test"))
        await { app.mainWindowFocused && app.appContainer.overlayStateStore.state.value.message?.id == "device-test-home" }

        shell("input keyevent KEYCODE_SLEEP")
        try {
            await { !context.getSystemService(PowerManager::class.java).isInteractive }
            assertEquals(PushPresentation.NOTIFY, presenter.present(mapOf("id" to "device-test-locked", "message" to "Teste com a tela apagada."), "test"))
            await { manager.activeNotifications.any { it.id == RinPushPresenter.NOTIFICATION_ID } }
            assertFalse(context.getSystemService(PowerManager::class.java).isInteractive)
        } finally {
            shell("input keyevent KEYCODE_WAKEUP")
            PendingPushStore(context).read()?.let { PendingPushStore(context).clear(it.token) }
            manager.cancel(RinPushPresenter.NOTIFICATION_ID)
        }
    }

    private fun shell(command: String) {
        instrumentation.uiAutomation.executeShellCommand(command).use { descriptor ->
            java.io.FileInputStream(descriptor.fileDescriptor).use { it.readBytes() }
        }
    }

    private fun await(condition: () -> Boolean) {
        val deadline = SystemClock.elapsedRealtime() + 15_000
        while (!condition() && SystemClock.elapsedRealtime() < deadline) SystemClock.sleep(100)
        assertTrue("Timed out waiting for device state", condition())
    }
}
