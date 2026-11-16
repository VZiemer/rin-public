package com.rinassistant.android.rin.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val RinLightColorScheme = lightColorScheme()

@Composable
fun RinTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = RinLightColorScheme,
        content = content,
    )
}
