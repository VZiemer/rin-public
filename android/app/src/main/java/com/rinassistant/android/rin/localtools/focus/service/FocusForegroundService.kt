package com.rinassistant.android.rin.localtools.focus.service

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.drawable.Icon
import android.os.Build
import android.os.IBinder
import com.rinassistant.android.R
import com.rinassistant.android.rin.app.RinApplication
import com.rinassistant.android.rin.domain.model.AvatarState
import com.rinassistant.android.rin.localtools.focus.FocusCompletionMessageFactory
import com.rinassistant.android.rin.localtools.focus.FocusNotificationFormatter
import com.rinassistant.android.rin.localtools.focus.FocusRinStateResolver
import com.rinassistant.android.rin.localtools.focus.FocusStatus
import com.rinassistant.android.rin.overlay.model.FocusOverlayPresentation
import com.rinassistant.android.rin.ui.main.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class FocusForegroundService : Service() {
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val completionMessageFactory = FocusCompletionMessageFactory()
    private val notificationFormatter = FocusNotificationFormatter()
    private val avatarStateResolver = FocusRinStateResolver()
    private lateinit var notificationManager: NotificationManager
    private var isHostingFocusSession = false
    private var hostedSessionId: String? = null
    private var completionMessageShown = false
    private var timerLoopJob: Job? = null

    override fun onCreate() {
        super.onCreate()
        notificationManager = getSystemService(NotificationManager::class.java)
        createNotificationChannel()
        observeFocusSession()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_CANCEL -> cancelFocusSession()
            else -> startFocusHost()
        }
        return START_STICKY
    }

    override fun onDestroy() {
        (application as RinApplication).appContainer.overlayStateStore.clearFocusPresentation()
        serviceScope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun startFocusHost() {
        serviceScope.launch {
            val appContainer = (application as RinApplication).appContainer
            val session = appContainer.focusRepository.currentSession.value
                ?: appContainer.restoreFocusSessionUseCase.restore()
            if (session == null) {
                stopSelf()
                return@launch
            }

            resetDistractionStateIfNeeded(session.id)
            if (session.status.isTerminal()) {
                if (session.status == FocusStatus.COMPLETED) {
                    showFocusCompletionMessageOnce()
                }
                stopSelf()
                return@launch
            }

            isHostingFocusSession = true
            startAsForegroundService()
            updateFocusOverlay()
            if (appContainer.overlayPermissionController.canDrawOverlays()) {
                startForegroundService(com.rinassistant.android.rin.overlay.service.RinOverlayService.createStartIntent(this@FocusForegroundService))
            }
            if (timerLoopJob?.isActive != true) {
                timerLoopJob = serviceScope.launch {
                    runTimerLoop()
                }
            }
        }
    }

    private fun cancelFocusSession() {
        serviceScope.launch {
            val appContainer = (application as RinApplication).appContainer
            appContainer.focusController.cancel()
            stopSelf()
        }
    }

    private fun observeFocusSession() {
        serviceScope.launch {
            val appContainer = (application as RinApplication).appContainer
            appContainer.focusRepository.currentSession.collectLatest { session ->
                if (!isHostingFocusSession) {
                    return@collectLatest
                }
                if (session == null || session.status.isTerminal()) {
                    if (session?.status == FocusStatus.COMPLETED) {
                        showFocusCompletionMessageOnce()
                    }
                    stopSelf()
                } else {
                    updateNotification()
                }
            }
        }
    }

    private suspend fun runTimerLoop() {
        val appContainer = (application as RinApplication).appContainer
        while (serviceScope.isActive) {
            val session = appContainer.focusRepository.currentSession.value
            if (session == null || session.status.isTerminal()) {
                stopSelf()
                return
            }

            val updatedSession = appContainer.focusController.completeIfExpired().getOrNull() ?: session
            if (updatedSession.status == FocusStatus.COMPLETED) {
                showFocusCompletionMessageOnce()
                stopSelf()
                return
            }

            if (updatedSession.status == FocusStatus.RUNNING) {
                appContainer.focusDistractionMonitor.checkForDistraction()
            }
            updateFocusOverlay()
            updateNotification()
            delay(TICK_MILLIS)
        }
    }

    private fun updateFocusOverlay() {
        val appContainer = (application as RinApplication).appContainer
        val session = appContainer.focusRepository.currentSession.value ?: return
        if (session.status.isTerminal()) {
            appContainer.overlayStateStore.clearFocusPresentation()
            return
        }

        val remainingText = appContainer.focusController.remainingMillis()
            .getOrNull()
            ?.let(notificationFormatter::formatRemaining)
            ?: getString(R.string.focus_notification_unknown_remaining)
        val nowMillis = appContainer.focusClock.nowMillis()
        val avatarState = avatarStateResolver.resolve(
            status = session.status,
            distractionEvent = appContainer.focusDistractionMonitor.lastEvent.value,
            nowMillis = nowMillis,
        )
        appContainer.overlayStateStore.showFocusPresentation(
            presentation = FocusOverlayPresentation(
                remainingText = remainingText,
                status = session.status,
                caption = captionFor(session.status, avatarState, remainingText),
            ),
            avatarState = avatarState,
        )
    }

    private fun showFocusCompletionMessageOnce() {
        if (completionMessageShown) {
            return
        }
        completionMessageShown = true
        val appContainer = (application as RinApplication).appContainer
        appContainer.overlayStateStore.showMessage(
            completionMessageFactory.create(
                messageText = getString(R.string.focus_completion_message),
            ),
        )
        appContainer.overlayStateStore.clearFocusPresentation()
    }

    private fun resetDistractionStateIfNeeded(sessionId: String) {
        if (hostedSessionId == sessionId) {
            return
        }
        hostedSessionId = sessionId
        completionMessageShown = false
        val appContainer = (application as RinApplication).appContainer
        appContainer.focusDistractionMonitor.reset()
    }

    private fun startAsForegroundService() {
        val notification = createNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun updateNotification() {
        if (!canPostNotificationUpdates()) {
            return
        }
        notificationManager.notify(NOTIFICATION_ID, createNotification())
    }

    private fun canPostNotificationUpdates(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private fun createNotification(): Notification {
        val appContainer = (application as RinApplication).appContainer
        val remainingText = appContainer.focusController.remainingMillis()
            .getOrNull()
            ?.let(notificationFormatter::formatRemaining)
            ?: getString(R.string.focus_notification_unknown_remaining)

        return Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_rin)
            .setContentTitle(getString(R.string.focus_notification_title))
            .setContentText(getString(R.string.focus_notification_text, remainingText))
            .setContentIntent(createContentPendingIntent())
            .setOngoing(true)
            .addAction(
                Notification.Action.Builder(
                    Icon.createWithResource(this, R.drawable.ic_stat_rin),
                    getString(R.string.focus_notification_cancel),
                    createCancelPendingIntent(),
                ).build(),
            )
            .build()
    }

    private fun createContentPendingIntent(): PendingIntent =
        PendingIntent.getActivity(
            this,
            OPEN_APP_REQUEST_CODE,
            Intent(this, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    private fun createCancelPendingIntent(): PendingIntent =
        PendingIntent.getService(
            this,
            CANCEL_REQUEST_CODE,
            createCancelIntent(this),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.focus_notification_channel_name),
            NotificationManager.IMPORTANCE_LOW,
        )
        notificationManager.createNotificationChannel(channel)
    }

    private fun FocusStatus.isTerminal(): Boolean =
        this == FocusStatus.COMPLETED || this == FocusStatus.CANCELLED

    private fun captionFor(status: FocusStatus, avatarState: AvatarState, remainingText: String): String =
        when {
            avatarState == AvatarState.ANGRY_POUT -> getString(
                R.string.focus_overlay_caption_repeated_distraction,
                remainingText,
            )
            avatarState == AvatarState.SCOLDING -> getString(
                R.string.focus_overlay_caption_distraction,
                remainingText,
            )
            status == FocusStatus.PAUSED -> getString(R.string.focus_overlay_caption_paused)
            else -> getString(R.string.focus_overlay_caption_running)
        }

    companion object {
        private const val ACTION_CANCEL = "com.rinassistant.android.action.CANCEL_FOCUS"
        private const val CHANNEL_ID = "rin_focus"
        private const val NOTIFICATION_ID = 1101
        private const val OPEN_APP_REQUEST_CODE = 2100
        private const val CANCEL_REQUEST_CODE = 2101
        private const val TICK_MILLIS = 1_000L

        fun createStartIntent(context: Context): Intent =
            Intent(context, FocusForegroundService::class.java)

        fun createCancelIntent(context: Context): Intent =
            Intent(context, FocusForegroundService::class.java).apply {
                action = ACTION_CANCEL
            }
    }
}
