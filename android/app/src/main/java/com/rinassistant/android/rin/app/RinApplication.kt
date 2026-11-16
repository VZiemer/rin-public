package com.rinassistant.android.rin.app

import android.app.Application

class RinApplication : Application() {
    @Volatile var mainWindowFocused = false
    @Volatile var assistantPanelVisible = false
    val appContainer: AppContainer by lazy { AppContainer(applicationContext) }
}
