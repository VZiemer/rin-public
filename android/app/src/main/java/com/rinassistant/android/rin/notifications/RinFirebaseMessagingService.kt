package com.rinassistant.android.rin.notifications

import android.util.Log
import com.rinassistant.android.R
import com.rinassistant.android.rin.app.RinApplication
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.launch
import com.rinassistant.android.rin.assistant.remote.RemoteImageCommand
import com.rinassistant.android.rin.assistant.remote.RemoteImageDownloadWorker

class RinFirebaseMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        RinFcmTokenStore.saveToken(this, token)
        val app = application as? RinApplication ?: return
        kotlinx.coroutines.MainScope().launch {
            if (app.appContainer.authRepository.getSession() != null) {
                app.appContainer.deviceRegistrar.register(token)
            }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val app = application as? RinApplication
        if (RemoteImageCommand.isCommand(message.data)) {
            if (app?.appContainer?.userSessionStore?.read() == null) return
            try {
                when (val command = RemoteImageCommand.parse(message.data)) {
                    is RemoteImageCommand.Available -> RemoteImageDownloadWorker.enqueue(this, command)
                    is RemoteImageCommand.Select -> app.appContainer.remoteAvatarImages.select(command.assistantId, command.name)
                }
            } catch (_: Exception) { Log.w("RinImages", "image_command_rejected") }
            return
        }
        val title = message.notification?.title ?: message.data["title"] ?: getString(R.string.app_name)
        val body = message.notification?.body ?: message.data["body"] ?: getString(R.string.fcm_notification_default_body)
        RinFcmTokenStore.saveMessage(this, message.from.orEmpty(), title, body, message.data)
        RinPushPresenter(this).present(message.data, body)
    }

    companion object { const val TAG = "RinFcm" }
}
