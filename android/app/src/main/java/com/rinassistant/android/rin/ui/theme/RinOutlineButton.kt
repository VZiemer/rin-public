package com.rinassistant.android.rin.ui.theme

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.RowScope
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun RinOutlineButton(onClick: () -> Unit, modifier: Modifier = Modifier,
    enabled: Boolean = true, content: @Composable RowScope.() -> Unit) {
    val color = MaterialTheme.colorScheme.primary
    OutlinedButton(onClick = onClick, modifier = modifier, enabled = enabled,
        border = BorderStroke(1.dp, color),
        colors = ButtonDefaults.outlinedButtonColors(containerColor = color.copy(alpha = 0.08f), contentColor = color),
        content = content)
}
