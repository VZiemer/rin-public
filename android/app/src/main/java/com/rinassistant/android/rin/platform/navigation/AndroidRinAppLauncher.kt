package com.rinassistant.android.rin.platform.navigation

import android.content.Context
import android.content.Intent
import com.rinassistant.android.rin.actions.RinAppLauncher
import com.rinassistant.android.rin.ui.main.MainActivity

class AndroidRinAppLauncher(
    private val context: Context,
) : RinAppLauncher {
    override fun openApp() {
        val intent = Intent(context, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        context.startActivity(intent)
    }
}
