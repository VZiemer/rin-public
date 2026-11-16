package com.rinassistant.android.rin.app

import android.content.Context
import com.rinassistant.android.R
import com.rinassistant.android.rin.actions.LocalRinActionHandler
import com.rinassistant.android.rin.domain.usecase.ChangeRinStateUseCase
import com.rinassistant.android.rin.domain.usecase.HandleRinActionUseCase
import com.rinassistant.android.rin.domain.usecase.ShowRinMessageUseCase
import com.rinassistant.android.rin.localtools.LocalActionDispatcher
import com.rinassistant.android.rin.localtools.LocalToolRegistry
import com.rinassistant.android.rin.localtools.alarm.AndroidAlarmController
import com.rinassistant.android.rin.localtools.alarm.GetNextAlarmTool
import com.rinassistant.android.rin.localtools.alarm.OpenAlarmsTool
import com.rinassistant.android.rin.localtools.alarm.SetAlarmTool
import com.rinassistant.android.rin.localtools.focus.DataStoreFocusSessionStorage
import com.rinassistant.android.rin.localtools.focus.FocusController
import com.rinassistant.android.rin.localtools.focus.FocusTimer
import com.rinassistant.android.rin.localtools.focus.InMemoryFocusRepository
import com.rinassistant.android.rin.localtools.focus.RestoreFocusSessionUseCase
import com.rinassistant.android.rin.localtools.focus.SystemFocusClock
import com.rinassistant.android.rin.localtools.focus.distraction.DataStoreDistractionAppPreferencesRepository
import com.rinassistant.android.rin.localtools.focus.distraction.ConfiguredDistractionPolicy
import com.rinassistant.android.rin.localtools.focus.distraction.FocusDistractionMonitor
import com.rinassistant.android.rin.localtools.usage.AndroidUsageAccessController
import com.rinassistant.android.rin.localtools.usage.AndroidAppUsageReader
import com.rinassistant.android.rin.localtools.usage.UsageAccessStatusProvider
import com.rinassistant.android.rin.auth.AuthRepository
import com.rinassistant.android.rin.auth.CognitoAuthRepository
import com.rinassistant.android.rin.auth.CognitoConfiguration
import com.rinassistant.android.rin.auth.PrefsUserSessionStore
import com.rinassistant.android.rin.auth.KeystoreSecureSessionStore
import com.rinassistant.android.rin.auth.LogoutUseCase
import com.rinassistant.android.rin.auth.SessionRestore
import com.rinassistant.android.rin.auth.UserBootstrap
import com.rinassistant.android.rin.auth.UserScopedState
import com.rinassistant.android.rin.auth.UserSessionStore
import com.rinassistant.android.rin.device.AuthenticatedDeviceRegistrar
import com.rinassistant.android.BuildConfig
import com.rinassistant.android.rin.assistant.AssistantCatalog
import com.rinassistant.android.rin.assistant.AssistantSelectionStore
import com.rinassistant.android.rin.assistant.DataStoreAssistantSelectionStore
import com.rinassistant.android.rin.overlay.controller.OverlayController
import com.rinassistant.android.rin.overlay.state.OverlayStateStore
import com.rinassistant.android.rin.platform.navigation.AndroidRinAppLauncher
import com.rinassistant.android.rin.platform.permissions.AndroidOverlayPermissionController
import com.rinassistant.android.rin.platform.permissions.OverlaySetupStatusProvider

class AppContainer(
    context: Context,
) {
    val remoteAvatarImages = com.rinassistant.android.rin.assistant.remote.RemoteAvatarImages(context.applicationContext)
    val assistantSelectionStore: AssistantSelectionStore = DataStoreAssistantSelectionStore(context.applicationContext)
    val userScopedState = UserScopedState()
    val userSessionStore: UserSessionStore = PrefsUserSessionStore(context.applicationContext)
    private val secureSessionStore = KeystoreSecureSessionStore(context.applicationContext)
    private val cognitoConfiguration = CognitoConfiguration.resolve(
        BuildConfig.COGNITO_CLIENT_ID, BuildConfig.COGNITO_REGION, secureSessionStore.read(),
    )
    val authRepository: AuthRepository = CognitoAuthRepository(
            clientId = cognitoConfiguration.clientId,
            region = cognitoConfiguration.region,
            store = secureSessionStore,
        )
    val sessionRestore = SessionRestore(authRepository)
    val userBootstrap = UserBootstrap(BuildConfig.AGENT_BASE_URL, authRepository, userSessionStore)
    val deviceRegistrar = AuthenticatedDeviceRegistrar(
        BuildConfig.AGENT_BASE_URL,
        BuildConfig.AGENT_DEVICE_ID,
        authRepository,
    )
    val logoutUseCase = LogoutUseCase(authRepository, userSessionStore, deviceRegistrar) {
        userSessionStore.read()?.userId?.let(userScopedState::clearUser)
    }
    val agentRepository = com.rinassistant.android.rin.agent.AgentRepository(
        com.rinassistant.android.rin.agent.HttpAgentApi(
            BuildConfig.AGENT_BASE_URL,
            accessToken = { authRepository.getSession()?.accessToken },
            refreshOnce = { runCatching { authRepository.refreshSession() }.isSuccess },
        ),
        BuildConfig.AGENT_DEVICE_ID,
    ) { assistantSelectionStore.selectedAssistantId.value }
    val statementApi: com.rinassistant.android.rin.finance.StatementApi = com.rinassistant.android.rin.finance.HttpStatementApi(
        BuildConfig.AGENT_BASE_URL,
        accessToken = { authRepository.getSession()?.accessToken },
        refreshOnce = { authRepository.refreshSession(); true },
    )
    private val alarmController = AndroidAlarmController(context.applicationContext)
    val localToolRegistry by lazy { LocalToolRegistry(
        tools = listOf(
            GetNextAlarmTool(alarmController),
            OpenAlarmsTool(alarmController),
            SetAlarmTool(alarmController),
            com.rinassistant.android.rin.localtools.focus.StartFocusTool { input ->
                val status = focusRepository.currentSession.value?.status
                check(status != com.rinassistant.android.rin.localtools.focus.FocusStatus.RUNNING &&
                    status != com.rinassistant.android.rin.localtools.focus.FocusStatus.PAUSED)
                focusController.start(input)
                context.applicationContext.startForegroundService(
                    com.rinassistant.android.rin.localtools.focus.service.FocusForegroundService.createStartIntent(context.applicationContext),
                )
            },
        ),
    ) }
    val localActionDispatcher by lazy { LocalActionDispatcher(localToolRegistry) }

    val overlayPermissionController = AndroidOverlayPermissionController(context)
    val overlaySetupStatusProvider = OverlaySetupStatusProvider(overlayPermissionController)
    val usageAccessController = AndroidUsageAccessController(context.applicationContext)
    val usageAccessStatusProvider = UsageAccessStatusProvider(usageAccessController)
    val appUsageReader = AndroidAppUsageReader(context.applicationContext)
    val focusRepository = InMemoryFocusRepository()
    val distractionAppPreferencesRepository = DataStoreDistractionAppPreferencesRepository(
        context.applicationContext,
    )
    val focusClock = SystemFocusClock()
    private val focusTimer = FocusTimer(focusClock)
    private val focusSessionStorage = DataStoreFocusSessionStorage(context.applicationContext)
    val focusController = FocusController(
        repository = focusRepository,
        clock = focusClock,
        timer = focusTimer,
        storage = focusSessionStorage,
    )
    val restoreFocusSessionUseCase = RestoreFocusSessionUseCase(
        repository = focusRepository,
        storage = focusSessionStorage,
        timer = focusTimer,
    )
    val focusDistractionMonitor = FocusDistractionMonitor(
        appUsageReader = appUsageReader,
        distractionPolicy = ConfiguredDistractionPolicy {
            distractionAppPreferencesRepository.preferences.value
        },
        clock = focusClock,
    )
    val overlayStateStore = OverlayStateStore()
    private val actionHandler = LocalRinActionHandler(
        overlayStateStore = overlayStateStore,
        appLauncher = AndroidRinAppLauncher(context.applicationContext),
        focusController = focusController,
        localActionDispatcher = localActionDispatcher,
        alarmLabel = context.getString(
            R.string.assistant_alarm_label,
            AssistantCatalog.requireById(assistantSelectionStore.selectedAssistantId.value).displayName,
        ),
    )

    fun createChangeRinStateUseCase(overlayController: OverlayController): ChangeRinStateUseCase =
        ChangeRinStateUseCase(overlayController)

    fun createShowRinMessageUseCase(): ShowRinMessageUseCase =
        ShowRinMessageUseCase(overlayStateStore)

    fun createHandleRinActionUseCase(): HandleRinActionUseCase =
        HandleRinActionUseCase(actionHandler)
}
