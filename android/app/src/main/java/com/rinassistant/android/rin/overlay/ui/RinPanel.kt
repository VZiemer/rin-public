package com.rinassistant.android.rin.overlay.ui

import androidx.annotation.DrawableRes
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Alarm
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import com.rinassistant.android.R
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.rinassistant.android.rin.assistant.AssistantQuickAction
import com.rinassistant.android.rin.domain.model.RinAction
import com.rinassistant.android.rin.domain.model.RinActionDescriptor

/** Immutable snapshot the overlay service pushes into the panel on every state change. */
data class RinPanelUiModel(
    val displayName: String,
    val accentColor: Long,
    val bubbleStartColor: Long,
    val bubbleEndColor: Long,
    val bubbleTextColor: Long,
    val backdropStartColor: Long,
    val backdropMidColor: Long,
    val backdropEndColor: Long,
    val inputFillColor: Long,
    val sendButtonColor: Long,
    @DrawableRes val avatarRes: Int,
    val remoteAvatar: android.graphics.Bitmap? = null,
    val avatarScale: Float = 1f,
    val avatarDescription: String,
    val closeDescription: String,
    val inputHint: String,
    val sendLabel: String,
    val thinkingLabel: String,
    val cancelLabel: String,
    val messageId: String? = null,
    val messageText: String? = null,
    val messageActions: List<RinActionDescriptor> = emptyList(),
    val messageRequiresAction: Boolean = false,
    val inputText: String = "",
    val isThinking: Boolean = false,
    val submitting: Boolean = false,
    val failureText: String? = null,
)

class RinPanelCallbacks(
    val onInputChange: (String) -> Unit,
    val onSend: () -> Unit,
    val onQuickAction: (AssistantQuickAction) -> Unit,
    val onMessageAction: (String, RinAction) -> Unit,
    val onClose: () -> Unit,
)

private data class QuickActionSpec(
    val action: AssistantQuickAction,
    val icon: ImageVector,
    val color: Color,
    val description: String,
)

private val QuickActions = listOf(
    QuickActionSpec(AssistantQuickAction.IMPORT_STATEMENT, Icons.Filled.AttachFile, Color(0xFF14B8A6), ""),
    QuickActionSpec(AssistantQuickAction.SET_ALARM, Icons.Filled.Alarm, Color(0xFF6366F1), "Set alarm"),
    QuickActionSpec(AssistantQuickAction.START_POMODORO, Icons.Filled.Timer, Color(0xFFE0457B), "Start Pomodoro"),
    QuickActionSpec(AssistantQuickAction.TODAYS_TASKS, Icons.Filled.Checklist, Color(0xFF16A34A), "Today’s tasks"),
    QuickActionSpec(AssistantQuickAction.ADD_REMINDER, Icons.Filled.Add, Color(0xFFF59E0B), "Add reminder"),
    QuickActionSpec(AssistantQuickAction.SETTINGS, Icons.Filled.Settings, Color(0xFF3B82F6), "Settings"),
)

@Composable
fun RinPanel(model: RinPanelUiModel, callbacks: RinPanelCallbacks) {
    val accent = Color(model.accentColor)
    val density = LocalDensity.current
    val imeInsets = androidx.compose.foundation.layout.WindowInsets.ime
    var restingInputHeight by remember { mutableStateOf(52.dp) }
    var footerHeight by remember { mutableStateOf(52.dp) }
    val configuration = LocalConfiguration.current
    var restingBodyHeight by remember(configuration.orientation, configuration.screenWidthDp) { mutableIntStateOf(0) }
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(
                        Color(model.backdropStartColor),
                        Color(model.backdropMidColor),
                        Color(model.backdropEndColor),
                    ),
                ),
            ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .safeDrawingPadding()
                .padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 16.dp),
        ) {
            PanelHeader(
                displayName = model.displayName,
                accent = accent,
                closeDescription = model.closeDescription,
                onClose = callbacks.onClose,
            )

            Box(modifier = Modifier.fillMaxWidth().weight(1f).onSizeChanged {
                // adjustResize can shrink the entire window, independently of Compose's IME padding.
                if (imeInsets.getBottom(density) == 0) restingBodyHeight = it.height
            }) {
                StableAvatar(
                    model = model,
                    restingBodyHeight = restingBodyHeight,
                    bottomInset = (restingInputHeight - 12.dp).coerceAtLeast(0.dp),
                    modifier = Modifier.fillMaxSize()
                        .padding(bottom = (footerHeight - 12.dp).coerceAtLeast(0.dp)).clipToBounds(),
                )

                val bubbleText = if (model.isThinking) thinkingDots() else model.messageText
                val thinkingDescription = stringResource(R.string.assistant_thinking, model.displayName)
                bubbleText?.let { text ->
                    MessageBubble(
                        text = text,
                        actions = if (model.isThinking) emptyList() else model.messageActions,
                        requiresAction = !model.isThinking && model.messageRequiresAction,
                        cancelLabel = model.cancelLabel,
                        bubbleStartColor = model.bubbleStartColor,
                        bubbleEndColor = model.bubbleEndColor,
                        bubbleTextColor = model.bubbleTextColor,
                        accent = accent,
                        onAction = { action -> model.messageId?.let { callbacks.onMessageAction(it, action) } },
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .widthIn(min = 64.dp, max = 280.dp)
                            .then(if (model.isThinking) Modifier.clearAndSetSemantics {
                                contentDescription = thinkingDescription
                            } else Modifier),
                    )
                }

                QuickActionColumn(
                    onQuickAction = callbacks.onQuickAction,
                    modifier = Modifier.align(Alignment.BottomEnd).imePadding().padding(bottom = footerHeight + 12.dp),
                )

                Column(
                    modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth()
                        .imePadding()
                        .onSizeChanged { footerHeight = with(density) { it.height.toDp() } },
                ) {
                    model.failureText?.let { failure ->
                        Text(
                            text = failure,
                            color = Color(0xFFFF8A80),
                            fontSize = 13.sp,
                            modifier = Modifier.padding(bottom = 6.dp, start = 4.dp),
                        )
                    }
                    Column(Modifier.onSizeChanged {
                        // Typing can grow the footer; the avatar keeps its resting size and position.
                        if (model.inputText.isEmpty()) restingInputHeight = with(density) { it.height.toDp() }
                    }) {
                        InputBar(model = model, callbacks = callbacks)
                    }
                }
            }
        }
    }
}

@Composable
private fun StableAvatar(model: RinPanelUiModel, restingBodyHeight: Int, bottomInset: androidx.compose.ui.unit.Dp, modifier: Modifier) {
    val painter = rememberBottomAlignedAvatarPainter(model.avatarRes, model.remoteAvatar)
    Canvas(modifier.semantics { contentDescription = model.avatarDescription }) {
        val source = painter.intrinsicSize
        if (source.width <= 0 || source.height <= 0) return@Canvas
        val normalHeight = restingBodyHeight.takeIf { it > 0 }?.toFloat() ?: (size.height + bottomInset.toPx())
        val baseline = normalHeight - bottomInset.toPx()
        val fit = minOf(size.width / source.width, baseline * 0.94f / source.height) * model.avatarScale
        val target = Size(source.width * fit, source.height * fit)
        // The keyboard and growing input crop this layer instead of scaling or moving the character.
        translate(left = -36.dp.toPx(), top = baseline - target.height) {
            with(painter) { draw(target) }
        }
    }
}

@Composable
private fun PanelHeader(
    displayName: String,
    accent: Color,
    closeDescription: String,
    onClose: () -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(text = displayName, color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.width(6.dp))
        Icon(
            imageVector = Icons.Filled.AutoAwesome,
            contentDescription = null,
            tint = accent,
            modifier = Modifier.size(18.dp),
        )
        Spacer(Modifier.weight(1f))
        IconButton(onClick = onClose) {
            Icon(
                imageVector = Icons.Filled.Close,
                contentDescription = closeDescription,
                tint = Color.White,
            )
        }
    }
}

@Composable
private fun MessageBubble(
    text: String,
    actions: List<RinActionDescriptor>,
    requiresAction: Boolean,
    cancelLabel: String,
    bubbleStartColor: Long,
    bubbleEndColor: Long,
    bubbleTextColor: Long,
    accent: Color,
    onAction: (RinAction) -> Unit,
    modifier: Modifier = Modifier,
) {
    val bubbleText = Color(bubbleTextColor)
    Column(
        modifier = modifier
            .background(
                brush = Brush.verticalGradient(listOf(Color(bubbleStartColor), Color(bubbleEndColor))),
                shape = RoundedCornerShape(20.dp),
            )
            .padding(14.dp),
    ) {
        Row {
            Text(
                text = text,
                color = bubbleText,
                fontSize = 15.sp,
                modifier = Modifier.weight(1f, fill = false),
            )
            Spacer(Modifier.width(6.dp))
            Icon(
                imageVector = Icons.Filled.AutoAwesome,
                contentDescription = null,
                tint = accent,
                modifier = Modifier.size(16.dp),
            )
        }
        if (actions.isNotEmpty() || requiresAction) {
            Row(
                horizontalArrangement = Arrangement.End,
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            ) {
                actions.forEach { descriptor ->
                    TextButton(onClick = { onAction(descriptor.action) }) {
                        Text(text = descriptor.label, color = bubbleText)
                    }
                }
                if (requiresAction) {
                    TextButton(onClick = { onAction(RinAction.Dismiss) }) {
                        Text(text = cancelLabel, color = bubbleText)
                    }
                }
            }
        }
    }
}

@Composable
private fun QuickActionColumn(
    onQuickAction: (AssistantQuickAction) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        QuickActions.forEach { spec ->
            Box(
                modifier = Modifier
                    .size(54.dp)
                    .background(color = spec.color.copy(alpha = 0.08f), shape = RoundedCornerShape(16.dp))
                    .border(1.5.dp, spec.color, RoundedCornerShape(16.dp))
                    .clickable { onQuickAction(spec.action) },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = spec.icon,
                    contentDescription = if (spec.action == AssistantQuickAction.IMPORT_STATEMENT) stringResource(R.string.finance_title) else spec.description,
                    tint = spec.color,
                    modifier = Modifier.size(26.dp),
                )
            }
        }
    }
}

@Composable
private fun thinkingDots(): String {
    var count by remember { mutableIntStateOf(1) }
    LaunchedEffect(Unit) {
        while (isActive) {
            delay(400)
            count = count % 3 + 1
        }
    }
    return ".".repeat(count)
}

@Composable
private fun InputBar(model: RinPanelUiModel, callbacks: RinPanelCallbacks) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .weight(1f)
                .background(
                    color = Color(model.inputFillColor).compositeOver(Color(model.backdropEndColor).copy(alpha = 1f)),
                    shape = RoundedCornerShape(28.dp),
                )
                .padding(horizontal = 16.dp, vertical = 10.dp),
        ) {
            Icon(
                imageVector = Icons.Filled.ChatBubbleOutline,
                contentDescription = null,
                tint = Color.White.copy(alpha = 0.7f),
                modifier = Modifier.size(18.dp),
            )
            Spacer(Modifier.width(10.dp))
            Box(modifier = Modifier.weight(1f)) {
                if (model.inputText.isEmpty()) {
                    Text(text = model.inputHint, color = Color.White.copy(alpha = 0.6f), fontSize = 15.sp)
                }
                BasicTextField(
                    value = model.inputText,
                    onValueChange = callbacks.onInputChange,
                    enabled = !model.submitting,
                    maxLines = 3,
                    textStyle = TextStyle(color = Color.White, fontSize = 15.sp),
                    cursorBrush = SolidColor(Color.White),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                    keyboardActions = KeyboardActions(onSend = { callbacks.onSend() }),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        Spacer(Modifier.width(8.dp))
        Button(
            onClick = callbacks.onSend,
            enabled = !model.submitting && model.inputText.isNotBlank(),
            shape = CircleShape,
            border = BorderStroke(1.dp, Color(model.sendButtonColor)),
            colors = ButtonDefaults.buttonColors(
                containerColor = Color(model.sendButtonColor).copy(alpha = 0.08f),
                contentColor = Color(model.sendButtonColor),
                disabledContainerColor = Color(model.sendButtonColor).copy(alpha = 0.03f),
                disabledContentColor = Color(model.sendButtonColor).copy(alpha = 0.4f),
            ),
        ) {
            Icon(imageVector = Icons.AutoMirrored.Filled.Send, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(6.dp))
            Text(
                text = (if (model.isThinking) model.thinkingLabel else model.sendLabel).uppercase(),
                textAlign = TextAlign.Center,
            )
        }
    }
    Spacer(Modifier.height(4.dp))
}
