package com.rinassistant.android.rin.overlay.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.drawable.Icon
import android.os.Build
import android.os.IBinder
import android.widget.Toast
import com.rinassistant.android.R
import com.rinassistant.android.rin.app.AppContainer
import com.rinassistant.android.rin.app.RinApplication
import com.rinassistant.android.rin.domain.model.RinAction
import com.rinassistant.android.rin.overlay.controller.AndroidOverlayWindowController
import com.rinassistant.android.rin.overlay.model.OverlayMode
import com.rinassistant.android.rin.overlay.renderer.AssistantAssetResolver
import com.rinassistant.android.rin.overlay.renderer.RinRenderer
import com.rinassistant.android.rin.platform.permissions.AndroidOverlayPermissionController
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/** Hosts the system overlay only while a Pomodoro presentation is active. */
class RinOverlayService : Service() {
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private lateinit var appContainer: AppContainer
    private lateinit var windowController: AndroidOverlayWindowController

    private lateinit var permissionController: AndroidOverlayPermissionController

    private var handlingAction = false

    override fun onCreate() {
        super.onCreate()
        appContainer = (application as RinApplication).appContainer
        permissionController = AndroidOverlayPermissionController(this)
        createNotificationChannel()
        windowController = AndroidOverlayWindowController(
            context = this,
            rinRenderer = RinRenderer(this, AssistantAssetResolver(this), ::handleFocusAction,
                remoteAvatar = { appContainer.remoteAvatarImages.bitmaps.value[it] }),
            createPanel = { error("Assistant is hosted by MainActivity") },
        )
        serviceScope.launch { appContainer.overlayStateStore.state.collect { syncOverlay() } }
        serviceScope.launch { appContainer.remoteAvatarImages.bitmaps.collect { syncOverlay() } }
    }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startAsForegroundService()
        when (intent?.action) {
            ACTION_STOP -> stopSelf()
            ACTION_CLOSE -> appContainer.overlayStateStore.hide()
            ACTION_OPEN -> stopSelf()
            else -> Unit
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {

        if (::windowController.isInitialized && windowController.isAttached) windowController.detach()
        serviceScope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun syncOverlay() {
        val state = appContainer.overlayStateStore.state.value
        val canDraw = permissionController.canDrawOverlays()

        if (FocusOverlayPolicy.shouldAttach(state, canDraw)) {
            if (windowController.isAttached) windowController.update(state) else windowController.attach(state)
        } else if (windowController.isAttached) {
            windowController.detach()
        }

        if (state.mode != OverlayMode.FOCUS) stopSelf()
    }

    private fun handleFocusAction(action: RinAction) {
        if (handlingAction) return
        handlingAction = true
        serviceScope.launch {
            try {
                appContainer.createHandleRinActionUseCase().handle(action)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                Toast.makeText(this@RinOverlayService, R.string.assistant_action_failed, Toast.LENGTH_LONG).show()
            } finally {
                handlingAction = false
            }
        }
    }

    private fun startAsForegroundService() {
        val notification = createNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
        getSystemService(NotificationManager::class.java).cancel(FCM_FALLBACK_NOTIFICATION_ID)
    }

    private fun createNotification(): Notification =
        Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_rin)
            .setContentTitle(getString(R.string.overlay_notification_title))
            .setContentText(getString(R.string.overlay_notification_text))
            .setContentIntent(PendingIntent.getActivity(this, OPEN_REQUEST_CODE, Intent(this, com.rinassistant.android.rin.ui.main.MainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
            .setOngoing(true)
            .addAction(
                Notification.Action.Builder(
                    Icon.createWithResource(this, R.drawable.ic_stat_rin),
                    getString(R.string.stop_overlay),
                    pendingServiceIntent(STOP_REQUEST_CODE, ACTION_STOP),
                ).build(),
            )
            .build()

    private fun pendingServiceIntent(requestCode: Int, action: String): PendingIntent {
        val intent = Intent(this, RinOverlayService::class.java).apply { this.action = action }
        return PendingIntent.getForegroundService(
            this,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.overlay_notification_channel_name),
            NotificationManager.IMPORTANCE_LOW,
        )
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    companion object {
        private const val ACTION_STOP = "com.rinassistant.android.action.STOP_OVERLAY"
        private const val ACTION_OPEN = "com.rinassistant.android.action.OPEN_OVERLAY"
        private const val ACTION_CLOSE = "com.rinassistant.android.action.CLOSE_OVERLAY"
        private const val CHANNEL_ID = "rin_overlay"
        private const val NOTIFICATION_ID = 1001
        private const val FCM_FALLBACK_NOTIFICATION_ID = 4101
        private const val OPEN_REQUEST_CODE = 2000
        private const val STOP_REQUEST_CODE = 2001

        /** Hosts the system overlay only while a Pomodoro presentation is active. */
        fun createStartIntent(context: Context): Intent =
            Intent(context, RinOverlayService::class.java)

        /** Hosts the system overlay only while a Pomodoro presentation is active. */
        fun createOpenIntent(context: Context): Intent =
            Intent(context, RinOverlayService::class.java).apply { action = ACTION_OPEN }

        /** Hosts the system overlay only while a Pomodoro presentation is active. */
        fun createCloseIntent(context: Context): Intent =
            Intent(context, RinOverlayService::class.java).apply { action = ACTION_CLOSE }

        /** Hosts the system overlay only while a Pomodoro presentation is active. */
        fun createStopIntent(context: Context): Intent =
            Intent(context, RinOverlayService::class.java).apply { action = ACTION_STOP }
    }
}
