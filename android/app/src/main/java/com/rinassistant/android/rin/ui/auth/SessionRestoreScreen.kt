package com.rinassistant.android.rin.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.rinassistant.android.rin.ui.theme.RinOutlineButton

@Composable
fun SessionRestoreScreen(failed: Boolean, onRetry: () -> Unit) {
    Surface(Modifier.fillMaxSize()) {
        Column(
            Modifier.safeDrawingPadding().padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (failed) {
                Text("Não foi possível reconectar. Confira sua conexão e tente novamente.")
                RinOutlineButton(onClick = onRetry) { Text("Tentar novamente") }
            } else {
                CircularProgressIndicator()
                Text("Reconectando…")
            }
        }
    }
}
