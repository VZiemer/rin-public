package com.rinassistant.android.rin.localtools.alarm

import android.app.AlarmManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.text.format.DateFormat
import java.util.Date

class AndroidAlarmController(
    private val context: Context,
    private val intentFactory: AlarmIntentFactory = AlarmIntentFactory(),
) : AlarmController {
    private val alarmManager = context.getSystemService(AlarmManager::class.java)
    private val packageManager = context.packageManager

    override fun getNextAlarm(): DeviceAlarm? {
        val nextAlarm = alarmManager.nextAlarmClock ?: return null
        return DeviceAlarm(
            triggerAtMillis = nextAlarm.triggerTime,
            formattedTime = DateFormat.getTimeFormat(context).format(Date(nextAlarm.triggerTime)),
        )
    }

    override fun openAlarms(): Result<Unit> =
        launch(intentFactory.createShowAlarmsSpec())

    override fun setAlarm(input: SetAlarmInput): Result<Unit> =
        launch(intentFactory.createSetAlarmSpec(input))

    private fun launch(spec: AlarmIntentSpec): Result<Unit> {
        val intent = spec.toIntent()
        if (!intent.canResolve()) {
            return Result.failure(AlarmToolException.NoCompatibleAlarmApp(spec.action))
        }

        return try {
            context.startActivity(intent)
            Result.success(Unit)
        } catch (_: ActivityNotFoundException) {
            Result.failure(AlarmToolException.NoCompatibleAlarmApp(spec.action))
        }
    }

    private fun AlarmIntentSpec.toIntent(): Intent {
        val spec = this
        return Intent(spec.action).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            spec.extras.forEach { (key, value) ->
                when (value) {
                    is Int -> putExtra(key, value)
                    is String -> putExtra(key, value)
                    is Boolean -> putExtra(key, value)
                }
            }
        }
    }

    private fun Intent.canResolve(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            packageManager.resolveActivity(
                this,
                PackageManager.ResolveInfoFlags.of(PackageManager.MATCH_DEFAULT_ONLY.toLong()),
            ) != null
        } else {
            @Suppress("DEPRECATION")
            packageManager.resolveActivity(this, PackageManager.MATCH_DEFAULT_ONLY) != null
        }
}
