package com.rinassistant.android.rin.ui.main

import android.content.ActivityNotFoundException
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.enableEdgeToEdge
import androidx.activity.compose.setContent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import com.rinassistant.android.rin.assistant.AssistantCatalog
import kotlinx.coroutines.launch
import com.rinassistant.android.R
import com.rinassistant.android.rin.app.AppContainer
import com.rinassistant.android.rin.app.RinApplication
import com.rinassistant.android.rin.localtools.usage.UsageAccessStatus
import com.rinassistant.android.rin.notifications.RinFcmTokenStore
import com.rinassistant.android.rin.notifications.RinFirebaseMessagingService
import com.rinassistant.android.rin.notifications.RinPushPresenter
import com.rinassistant.android.rin.notifications.PendingPushStore
import com.rinassistant.android.rin.notifications.RinBackendMessageMapper
import com.rinassistant.android.rin.overlay.service.RinOverlayService
import com.rinassistant.android.rin.platform.permissions.OverlaySetupStatus
import com.rinassistant.android.rin.auth.AuthError
import com.rinassistant.android.rin.ui.auth.AuthMode
import com.rinassistant.android.rin.ui.auth.AuthScreen
import com.rinassistant.android.rin.ui.auth.SessionRestoreScreen
import com.rinassistant.android.rin.ui.settings.RinSettingsScreen
import com.rinassistant.android.rin.ui.theme.RinTheme
import com.google.firebase.messaging.FirebaseMessaging

class MainActivity : ComponentActivity() {
    private lateinit var appContainer: AppContainer
    private var overlayStatus by mutableStateOf(OverlaySetupStatus.NOT_CONFIGURED)
    private var usageAccessStatus by mutableStateOf(UsageAccessStatus.NOT_GRANTED)
    private var showingSettings by mutableStateOf(false)
    private var showingFinance by mutableStateOf(false)
    private var authenticated by mutableStateOf<Boolean?>(null)
    private var sessionRestoreFailed by mutableStateOf(false)
    private var authLoading by mutableStateOf(false)
    private var authError by mutableStateOf<String?>(null)
    private var authMode by mutableStateOf(AuthMode.SIGN_IN)
    private var authEmail by mutableStateOf("")
    private var authPassword by mutableStateOf("")
    private var authCode by mutableStateOf("")
    // Firebase brings Fragment 1.1 transitively, but this activity extends ComponentActivity
    // directly and never uses FragmentActivity's permission/result dispatch.
    @android.annotation.SuppressLint("InvalidFragmentVersionForActivityResult")
    private val notificationPermissionRequest = registerForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) consumePendingMessage()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        window.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        appContainer = (application as RinApplication).appContainer
        if (appContainer.overlayStateStore.state.value.mode != com.rinassistant.android.rin.overlay.model.OverlayMode.FOCUS) {
            stopService(android.content.Intent(this, RinOverlayService::class.java))
        }
        refreshPermissionStatuses()
        logFcmToken()
        showingSettings = intent.action != RinPushPresenter.ACTION_MESSAGE &&
            (savedInstanceState?.getBoolean("settings") == true || intent.action == ACTION_SETTINGS)
        showingFinance = intent.action != RinPushPresenter.ACTION_MESSAGE &&
            (savedInstanceState?.getBoolean("finance") ?: (intent.action == ACTION_FINANCE))
        setContent {
            val selectedAssistantId by appContainer.assistantSelectionStore.selectedAssistantId.collectAsState()
            val scope = rememberCoroutineScope()
            RinTheme {
                when (authenticated) {
                    null -> SessionRestoreScreen(
                        failed = sessionRestoreFailed,
                        onRetry = { scope.launch { restoreSession() } },
                    )
                    false -> AuthScreen(
                        mode = authMode,
                        onModeChange = { authMode = it; authError = null },
                        email = authEmail,
                        password = authPassword,
                        code = authCode,
                        onEmailChange = { authEmail = it },
                        onPasswordChange = { authPassword = it },
                        onCodeChange = { authCode = it },
                        loading = authLoading,
                        error = authError,
                        onSignIn = { scope.launch { signIn(authEmail, authPassword) } },
                        onSignUp = { scope.launch { signUp(authEmail, authPassword) } },
                        onConfirm = { scope.launch { confirm(authEmail, authCode) } },
                    )
                    true -> if (showingFinance) {
                        com.rinassistant.android.rin.ui.finance.StatementImportRoute(
                            container = appContainer,
                            assistantId = selectedAssistantId,
                            onBack = { showingFinance = false },
                        )
                    } else if (showingSettings) {
                        RinSettingsScreen(
                            overlayStatus = overlayStatus.toDisplayText(),
                            usageStatus = usageAccessStatus.toDisplayText(),
                            assistants = AssistantCatalog.all(),
                            selectedAssistantId = selectedAssistantId,
                            onSelectAssistant = { assistantId ->
                                scope.launch { appContainer.assistantSelectionStore.setSelectedAssistantId(assistantId) }
                            },
                            onConfigureOverlay = ::openOverlayPermissionSettings,
                            onConfigureUsage = ::openUsageAccessSettings,
                            onConfigureNotifications = ::openNotificationSettings,
                            onStartOverlay = ::showAssistant,
                            onStopOverlay = ::stopOverlayService,
                            onLogout = { scope.launch { logout() } },
                            onImportStatement = { showingFinance = true },
                            onBack = ::showAssistant,
                        )
                    } else {
                        val host = androidx.compose.runtime.remember { AssistantPanelHost(this@MainActivity) }
                        androidx.compose.runtime.DisposableEffect(host) {
                            (application as RinApplication).assistantPanelVisible = true
                            onDispose {
                                (application as RinApplication).assistantPanelVisible = false
                                host.close()
                            }
                        }
                        host.model?.let { com.rinassistant.android.rin.overlay.ui.RinPanel(it, host.callbacks) }
                    }
                }
            }
        }
        kotlinx.coroutines.MainScope().launch { restoreSession() }
    }

    override fun onResume() {
        super.onResume()
        if (::appContainer.isInitialized) {
            refreshPermissionStatuses()
        }
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent.action == ACTION_SETTINGS) {
            showingFinance = false
            showingSettings = true
            refreshPermissionStatuses()
        } else if (intent.action == ACTION_FINANCE) {
            showingFinance = true
            showingSettings = false
        } else if (authenticated == true) {
            showingFinance = false
            showingSettings = false
            consumePendingMessage()
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        (application as RinApplication).mainWindowFocused = hasFocus
    }

    override fun onPause() {
        (application as RinApplication).mainWindowFocused = false
        super.onPause()
    }

    private fun consumePendingMessage() {
        if (authenticated != true) return
        val store = PendingPushStore(this)
        val pending = store.read() ?: return
        val userId = appContainer.userSessionStore.read()?.userId
        // A regular launcher open also recovers an unread message if notifications were disabled.
        val token = if (intent.action == RinPushPresenter.ACTION_MESSAGE)
            intent.getStringExtra(RinPushPresenter.EXTRA_TOKEN) else pending.token
        if (!pending.belongsTo(token, userId)) return
        appContainer.remoteAvatarImages.selectIfPresent(pending.data["assistantId"] ?: "RIN", pending.data["imageName"])
        appContainer.createShowRinMessageUseCase().showMessage(RinBackendMessageMapper().map(pending.data, pending.body))
        store.clear(pending.token)
        getSystemService(android.app.NotificationManager::class.java).cancel(RinPushPresenter.NOTIFICATION_ID)
        intent.removeExtra(RinPushPresenter.EXTRA_TOKEN)
        showingSettings = false
        showingFinance = false
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < 33 || checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) ==
            android.content.pm.PackageManager.PERMISSION_GRANTED) return
        val prefs = getSharedPreferences("rin_permissions", MODE_PRIVATE)
        if (!prefs.getBoolean("notifications_requested", false)) {
            prefs.edit().putBoolean("notifications_requested", true).apply()
            notificationPermissionRequest.launch(android.Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    private fun openNotificationSettings() {
        startActivity(android.content.Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS)
            .putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, packageName))
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putBoolean("settings", showingSettings)
        outState.putBoolean("finance", showingFinance)
        super.onSaveInstanceState(outState)
    }

    private fun refreshPermissionStatuses() {
        overlayStatus = appContainer.overlaySetupStatusProvider.currentStatus()
        usageAccessStatus = appContainer.usageAccessStatusProvider.currentStatus()
    }

    private fun logFcmToken() {
        if (com.google.firebase.FirebaseApp.getApps(this).isEmpty()) return
        val messaging = FirebaseMessaging.getInstance()
        messaging.isAutoInitEnabled = true
        messaging.register().addOnCompleteListener {
            fetchAndStoreFcmToken(messaging)
        }
    }

    @Suppress("DEPRECATION")
    private fun fetchAndStoreFcmToken(messaging: FirebaseMessaging) {
        messaging.token.addOnCompleteListener { task ->
            if (!task.isSuccessful) {
                Log.w(RinFirebaseMessagingService.TAG, "push_registration_failed")
                RinFcmTokenStore.saveError(this, task.exception)
                return@addOnCompleteListener
            }
            RinFcmTokenStore.saveToken(this, task.result)
            kotlinx.coroutines.MainScope().launch {
                if (appContainer.authRepository.getSession() != null) {
                    appContainer.deviceRegistrar.register(task.result)
                }
            }
        }
    }

    private suspend fun restoreSession() {
        sessionRestoreFailed = false
        try {
            authenticated = appContainer.sessionRestore.restore() != null
        } catch (cancelled: kotlinx.coroutines.CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            sessionRestoreFailed = true
            return
        }
        if (authenticated == true) afterAuthenticated()
    }

    private fun authFailureMessage(error: Throwable): String = when (error) {
        is AuthError.InvalidCredentials -> getString(R.string.auth_error)
        is AuthError.NotConfirmed -> {
            authMode = AuthMode.CONFIRM
            "Confirme o codigo enviado ao e-mail."
        }
        is AuthError.Unavailable -> error.message ?: getString(R.string.auth_error)
        else -> error.message ?: getString(R.string.auth_error)
    }

    private suspend fun signIn(email: String, password: String) {
        authLoading = true
        authError = null
        val result = runCatching { appContainer.authRepository.signIn(email.trim(), password) }
        authLoading = false
        result.onSuccess {
            authenticated = true
            afterAuthenticated()
        }.onFailure { authError = authFailureMessage(it) }
    }

    private suspend fun signUp(email: String, password: String) {
        authLoading = true
        authError = null
        val result = runCatching { appContainer.authRepository.signUp(email.trim(), password) }
        authLoading = false
        result.onSuccess {
            authMode = AuthMode.CONFIRM
            authError = getString(R.string.auth_sign_up_sent)
        }.onFailure { authError = authFailureMessage(it) }
    }

    private suspend fun confirm(email: String, code: String) {
        authLoading = true
        authError = null
        val result = runCatching { appContainer.authRepository.confirmSignUp(email.trim(), code.trim()) }
        authLoading = false
        result.onSuccess {
            signIn(email, authPassword)
        }.onFailure { authError = authFailureMessage(it) }
    }

    private suspend fun logout() {
        appContainer.logoutUseCase.execute()
        showingFinance = false
        authenticated = false
    }

    private suspend fun afterAuthenticated() {
        requestNotificationPermissionIfNeeded()
        consumePendingMessage()
        runCatching { appContainer.userBootstrap.ensure() }
            .onSuccess { Log.i("RinAuth", "bootstrap_ok") }
            .onFailure { Log.e("RinAuth", "bootstrap_error") }
        consumePendingMessage()
        RinFcmTokenStore.pendingToken(this)?.let { token ->
            runCatching { appContainer.deviceRegistrar.register(token) }
                .onFailure { Log.e("RinAuth", "device_register_error") }
        }
    }

    private fun openOverlayPermissionSettings() {
        val intent = appContainer.overlayPermissionController.createPermissionIntent()
        try {
            startActivity(intent)
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(this, R.string.overlay_settings_unavailable, Toast.LENGTH_LONG).show()
        }
    }

    private fun openUsageAccessSettings() {
        val intent = appContainer.usageAccessController.createUsageAccessSettingsIntent()
        try {
            startActivity(intent)
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(this, R.string.usage_access_settings_unavailable, Toast.LENGTH_LONG).show()
        }
    }

    private fun showAssistant() {
        showingSettings = false
    }

    private fun stopOverlayService() {
        startService(RinOverlayService.createStopIntent(this))
    }

    private fun startForegroundServiceCompat(intent: android.content.Intent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
    }

    companion object {
        const val ACTION_SETTINGS = "com.rinassistant.android.action.SETTINGS"
        const val ACTION_FINANCE = "com.rinassistant.android.action.FINANCE"
    }
}

@Composable
private fun OverlaySetupStatus.toDisplayText(): String =
    when (this) {
        OverlaySetupStatus.CONFIGURED -> stringResource(R.string.overlay_configured)
        OverlaySetupStatus.NOT_CONFIGURED -> stringResource(R.string.overlay_not_configured)
    }

@Composable
private fun UsageAccessStatus.toDisplayText(): String =
    when (this) {
        UsageAccessStatus.GRANTED -> stringResource(R.string.usage_access_granted)
        UsageAccessStatus.NOT_GRANTED -> stringResource(R.string.usage_access_not_granted)
    }
