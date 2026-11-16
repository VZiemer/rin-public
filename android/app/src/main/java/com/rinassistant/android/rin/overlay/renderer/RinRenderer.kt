package com.rinassistant.android.rin.overlay.renderer

import android.content.Context
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import com.rinassistant.android.R
import com.rinassistant.android.rin.domain.model.RinAction
import com.rinassistant.android.rin.localtools.focus.FocusStatus
import com.rinassistant.android.rin.overlay.model.FocusOverlayPresentation
import com.rinassistant.android.rin.overlay.model.OverlayUiState

/**
 * Renders the Pomodoro focus overlay (classic Views). The assistant panel is now rendered with
 * Jetpack Compose in [com.rinassistant.android.rin.overlay.ui.RinPanel].
 */
class RinRenderer(
    private val context: Context,
    private val assetResolver: AssistantAssetResolver,
    private val onActionSelected: (RinAction) -> Unit = {},
    private val onBackdropTapped: () -> Unit = {},
    private val remoteAvatar: (String) -> android.graphics.Bitmap? = { null },
) {
    fun createFocusView(state: OverlayUiState): View {
        val presentation = requireNotNull(state.focusPresentation)
        val padding = context.resources.getDimensionPixelSize(R.dimen.rin_focus_overlay_padding)
        val itemSpacing = context.resources.getDimensionPixelSize(R.dimen.rin_focus_item_spacing)
        val actionSpacing = context.resources.getDimensionPixelSize(R.dimen.rin_focus_action_spacing)
        val assistantId = state.visibleAssistantId
        val drawable = assetResolver.focusDrawableFor(assistantId, presentation.status, state.avatarState)
        val remote = remoteAvatar(assistantId)
        val avatarSize = (
            context.resources.getDimensionPixelSize(R.dimen.rin_focus_avatar_size) *
                (if (remote != null) 1f else assetResolver.scaleFor(assistantId, drawable))
            ).toInt()

        return createBackdrop().apply {
            addView(
                LinearLayout(context).apply {
                    orientation = LinearLayout.VERTICAL
                    gravity = Gravity.CENTER_HORIZONTAL
                    setPadding(padding, padding, padding, padding)
                    contentDescription = context.getString(R.string.rin_focus_overlay_content_description)

                    addView(
                        TextView(context).apply {
                            text = presentation.remainingText
                            setTextColor(context.getColor(R.color.rin_focus_timer_text))
                            textSize = 34f
                            gravity = Gravity.CENTER
                            includeFontPadding = false
                        },
                        LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.WRAP_CONTENT,
                            LinearLayout.LayoutParams.WRAP_CONTENT,
                        ).apply {
                            bottomMargin = itemSpacing
                        },
                    )

                    addView(
                        ImageView(context).apply {
                            adjustViewBounds = true
                            scaleType = ImageView.ScaleType.FIT_CENTER
                            if (remote != null) setImageBitmap(remote) else setImageResource(drawable)
                            contentDescription = context.getString(
                                R.string.assistant_avatar_content_description,
                                com.rinassistant.android.rin.assistant.AssistantCatalog.requireById(assistantId).displayName,
                            )
                        },
                        LinearLayout.LayoutParams(avatarSize, avatarSize).apply {
                            bottomMargin = itemSpacing
                        },
                    )

                    addView(
                        TextView(context).apply {
                            text = presentation.caption
                            setTextColor(context.getColor(R.color.rin_focus_caption_text))
                            textSize = 18f
                            gravity = Gravity.CENTER
                        },
                        LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.WRAP_CONTENT,
                            LinearLayout.LayoutParams.WRAP_CONTENT,
                        ).apply {
                            bottomMargin = itemSpacing
                        },
                    )

                    addView(
                        LinearLayout(context).apply {
                            orientation = LinearLayout.HORIZONTAL
                            gravity = Gravity.CENTER
                            createFocusActions(presentation).forEachIndexed { index, action ->
                                addView(
                                    Button(context).apply {
                                        val accent = com.rinassistant.android.rin.assistant.AssistantCatalog.requireById(assistantId).theme.accentColor.toInt()
                                        backgroundTintList = null
                                        background = android.graphics.drawable.GradientDrawable().apply {
                                            cornerRadius = 16 * context.resources.displayMetrics.density
                                            setColor((accent and 0x00FFFFFF) or 0x14000000)
                                            setStroke((context.resources.displayMetrics.density * 1.5f).toInt().coerceAtLeast(1), accent)
                                        }
                                        setTextColor(accent)
                                        text = action.label
                                        isAllCaps = false
                                        contentDescription = action.label
                                        setOnClickListener { onActionSelected(action.action) }
                                    },
                                    LinearLayout.LayoutParams(
                                        LinearLayout.LayoutParams.WRAP_CONTENT,
                                        LinearLayout.LayoutParams.WRAP_CONTENT,
                                    ).apply {
                                        if (index > 0) {
                                            marginStart = actionSpacing
                                        }
                                    },
                                )
                            }
                        },
                    )
                },
                FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.WRAP_CONTENT,
                    FrameLayout.LayoutParams.WRAP_CONTENT,
                    Gravity.CENTER,
                ),
            )
        }
    }

    private fun createBackdrop(): FrameLayout = FrameLayout(context).apply {
        setBackgroundColor(context.getColor(R.color.rin_focus_backdrop))
        isClickable = true
        isFocusable = true
        setOnClickListener { onBackdropTapped() }
    }

    private fun createFocusActions(presentation: FocusOverlayPresentation): List<FocusActionButton> =
        when (presentation.status) {
            FocusStatus.PAUSED -> listOf(
                FocusActionButton(
                    label = context.getString(R.string.focus_action_resume),
                    action = RinAction.ResumeFocus,
                ),
                FocusActionButton(
                    label = context.getString(R.string.focus_action_cancel),
                    action = RinAction.CancelFocus,
                ),
            )
            FocusStatus.RUNNING -> listOf(
                FocusActionButton(
                    label = context.getString(R.string.focus_action_pause),
                    action = RinAction.PauseFocus,
                ),
                FocusActionButton(
                    label = context.getString(R.string.focus_action_cancel),
                    action = RinAction.CancelFocus,
                ),
            )
            else -> listOf(
                FocusActionButton(
                    label = context.getString(R.string.focus_action_cancel),
                    action = RinAction.CancelFocus,
                ),
            )
        }

    private data class FocusActionButton(
        val label: String,
        val action: RinAction,
    )
}
