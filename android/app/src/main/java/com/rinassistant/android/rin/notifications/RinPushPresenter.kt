package com.rinassistant.android.rin.notifications

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import com.rinassistant.android.R
import com.rinassistant.android.rin.app.RinApplication
import com.rinassistant.android.rin.assistant.AssistantCatalog
import com.rinassistant.android.rin.ui.main.MainActivity

/** Shared by FCM delivery and device integration tests; no network or UI automation required. */
class RinPushPresenter(private val context: Context) {
    private val app = context.applicationContext as RinApplication
    private val store = PendingPushStore(context)

    fun present(data: Map<String, String>, body: String): PushPresentation {
        val userId = app.appContainer.userSessionStore.read()?.userId
        if (userId == null) {
            notify(context.getString(R.string.app_name), context.getString(R.string.auth_required), null)
            return PushPresentation.NOTIFY
        }
        val pending = PendingPush.create(userId, data, body)
        val message = RinBackendMessageMapper().map(pending.data, pending.body)
        app.appContainer.remoteAvatarImages.selectIfPresent(message.assistantId, data["imageName"])
        val route = PushPresentationPolicy.decide(AndroidPushScreenReader(context).read())
        if (route == PushPresentation.IN_APP) {
            app.appContainer.createShowRinMessageUseCase().showMessage(message)
        } else {
            store.save(pending)
            val assistant = AssistantCatalog.requireById(message.assistantId).displayName
            // Keep a notification until the Activity acknowledges delivery: Android may silently deny a launch.
            notify(context.getString(R.string.assistant_incoming_message, assistant),
                context.getString(R.string.assistant_incoming_message_hint), pending.token)
            if (route == PushPresentation.OPEN_APP) {
                // Recheck at the last moment so a lock or app switch cannot use a stale snapshot.
                if (PushPresentationPolicy.decide(AndroidPushScreenReader(context).read()) == PushPresentation.OPEN_APP) {
                    try { context.startActivity(openIntent(context, pending.token).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                    catch (_: RuntimeException) { Log.w("RinPush", "automatic_open_failed_notification_retained") }
                }
            }
        }
        Log.i("RinPush", "presentation=$route")
        return route
    }

    private fun notify(title: String, body: String, token: String?) {
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            Log.w("RinPush", "notification_permission_missing")
            return
        }
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL_ID,
            context.getString(R.string.fcm_notification_channel_name), NotificationManager.IMPORTANCE_HIGH))
        val intent = PendingIntent.getActivity(context, 4102, openIntent(context, token),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        manager.notify(NOTIFICATION_ID, Notification.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_rin).setContentTitle(title).setContentText(body)
            .setLargeIcon(faceIcon())
            .setContentIntent(intent).setCategory(Notification.CATEGORY_MESSAGE)
            .setVisibility(Notification.VISIBILITY_PRIVATE).setAutoCancel(true).build())
    }

    private fun faceIcon(): android.graphics.Bitmap {
        val drawable = requireNotNull(context.getDrawable(R.drawable.rin_launcher_foreground))
        val bitmap = android.graphics.Bitmap.createBitmap(192, 192, android.graphics.Bitmap.Config.ARGB_8888)
        drawable.setBounds(0, 0, 192, 192)
        drawable.draw(android.graphics.Canvas(bitmap))
        return bitmap
    }

    companion object {
        const val ACTION_MESSAGE = "com.rinassistant.android.action.OPEN_MESSAGE"
        const val EXTRA_TOKEN = "push_token"
        const val NOTIFICATION_ID = 4101
        private const val CHANNEL_ID = "rin_conversations"
        fun openIntent(context: Context, token: String?) = Intent(context, MainActivity::class.java)
            .setAction(ACTION_MESSAGE).putExtra(EXTRA_TOKEN, token)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
}
