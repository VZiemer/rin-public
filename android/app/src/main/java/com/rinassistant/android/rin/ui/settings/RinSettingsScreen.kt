package com.rinassistant.android.rin.ui.settings

import androidx.compose.foundation.Image
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import com.rinassistant.android.rin.ui.theme.RinOutlineButton as Button
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.rinassistant.android.R
import com.rinassistant.android.rin.assistant.AssistantDefinition
import com.rinassistant.android.rin.domain.model.AvatarState

@Composable
fun RinSettingsScreen(
    overlayStatus: String,
    usageStatus: String,
    assistants: List<AssistantDefinition>,
    selectedAssistantId: String,
    onSelectAssistant: (String) -> Unit,
    onConfigureOverlay: () -> Unit,
    onConfigureUsage: () -> Unit,
    onConfigureNotifications: () -> Unit = {},
    onStartOverlay: () -> Unit,
    onStopOverlay: () -> Unit,
    onLogout: () -> Unit = {},
    onImportStatement: () -> Unit = {},
    onBack: () -> Unit,
) {
    Surface(Modifier.fillMaxSize()) {
        Column(
            Modifier.safeDrawingPadding().padding(24.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(stringResource(R.string.assistant_settings), style = MaterialTheme.typography.headlineMedium)
            Text(stringResource(R.string.assistant_selector_title), style = MaterialTheme.typography.titleMedium)
            assistants.forEach { assistant ->
                AssistantSelectorRow(
                    assistant = assistant,
                    selected = assistant.id == selectedAssistantId,
                    onClick = { onSelectAssistant(assistant.id) },
                )
            }
            Text(overlayStatus)
            Text(stringResource(R.string.pomodoro_overlay_explanation))
            Button(onClick = onConfigureOverlay) { Text(stringResource(R.string.configure_overlay)) }
            Text(usageStatus)
            Text(stringResource(R.string.usage_access_permission_explanation))
            Button(onClick = onConfigureUsage) { Text(stringResource(R.string.configure_usage_access)) }
            Button(onClick = onConfigureNotifications) { Text(stringResource(R.string.configure_notifications)) }
            Button(onClick = onImportStatement) { Text(stringResource(R.string.finance_title)) }
            TextButton(onClick = onLogout) { Text(stringResource(R.string.auth_logout)) }
            TextButton(onClick = onBack) { Text(stringResource(R.string.assistant_back)) }
        }
    }
}

@Composable
private fun AssistantSelectorRow(
    assistant: AssistantDefinition,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val preview = assistant.avatarAssets.drawableFor(AvatarState.NEUTRAL)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .then(
                if (selected) Modifier.border(2.dp, MaterialTheme.colorScheme.primary, RoundedCornerShape(16.dp))
                else Modifier,
            )
            .clickable(onClick = onClick)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Image(
            painter = painterResource(preview),
            contentDescription = stringResource(R.string.assistant_avatar_content_description, assistant.displayName),
            contentScale = ContentScale.Fit,
            modifier = Modifier.size(56.dp),
        )
        Column(Modifier.weight(1f)) {
            Text(assistant.displayName, style = MaterialTheme.typography.titleMedium)
            if (assistant.description.isNotBlank()) {
                Text(assistant.description, style = MaterialTheme.typography.bodySmall)
            }
        }
        if (selected) {
            Text(stringResource(R.string.assistant_selected), style = MaterialTheme.typography.labelLarge)
        }
    }
}
