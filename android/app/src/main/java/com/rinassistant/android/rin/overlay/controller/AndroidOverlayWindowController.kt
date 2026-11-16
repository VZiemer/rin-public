package com.rinassistant.android.rin.overlay.controller

import android.content.Context
import android.graphics.PixelFormat
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import com.rinassistant.android.rin.overlay.model.OverlayMode
import com.rinassistant.android.rin.overlay.model.OverlayUiState
import com.rinassistant.android.rin.overlay.renderer.RinRenderer
import com.rinassistant.android.rin.overlay.ui.RinPanelView

/**
 * Attaches a single full-screen window to the [WindowManager]:
 * - [OverlayMode.OPEN]: the Compose assistant panel ([RinPanelView]).
 * - [OverlayMode.FOCUS]: the classic Pomodoro overlay from [RinRenderer].
 *
 * There is no more floating/draggable avatar and no position tracking.
 */
class AndroidOverlayWindowController(
    private val context: Context,
    private val rinRenderer: RinRenderer,
    private val createPanel: () -> RinPanelView,
) : OverlayWindowController {
    private val windowManager = context.getSystemService(WindowManager::class.java)
    private var overlayView: View? = null
    private var layoutParams: WindowManager.LayoutParams? = null
    private var currentMode: OverlayMode? = null

    /** The Compose panel currently attached (if [OverlayMode.OPEN]), so callers can push new models. */
    var panel: RinPanelView? = null
        private set

    override val isAttached: Boolean
        get() = overlayView != null

    override fun attach(initialState: OverlayUiState) {
        if (overlayView != null) return
        val view = createViewFor(initialState)
        val params = createLayoutParams(initialState)
        layoutParams = params
        windowManager.addView(view, params)
        overlayView = view
        currentMode = initialState.mode
    }

    override fun update(state: OverlayUiState) {
        val view = overlayView ?: return
        val params = layoutParams ?: return

        if (state.mode != currentMode) {
            windowManager.removeViewImmediate(view)
            panel = null
            val newView = createViewFor(state)
            val newParams = createLayoutParams(state)
            layoutParams = newParams
            windowManager.addView(newView, newParams)
            overlayView = newView
            currentMode = state.mode
            return
        }

        when (state.mode) {
            OverlayMode.OPEN -> Unit // Panel content is driven by RinPanelView.render(model).
            OverlayMode.FOCUS -> {
                (view as? FrameLayout)?.apply {
                    removeAllViews()
                    addView(rinRenderer.createFocusView(state))
                }
            }
        }

        val newFlags = flagsFor(state)
        if (params.flags != newFlags) {
            params.flags = newFlags
            windowManager.updateViewLayout(view, params)
        }
    }

    override fun detach() {
        val view = overlayView ?: return
        overlayView = null
        layoutParams = null
        currentMode = null
        panel = null
        windowManager.removeViewImmediate(view)
    }

    private fun createViewFor(state: OverlayUiState): View = when (state.mode) {
        OverlayMode.OPEN -> createPanel().also { panel = it }
        OverlayMode.FOCUS -> FrameLayout(context).apply { addView(rinRenderer.createFocusView(state)) }
    }

    private fun createLayoutParams(state: OverlayUiState): WindowManager.LayoutParams =
        WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            flagsFor(state),
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
        }

    /**
     * The panel must be focusable (to receive text input + the BACK key); the focus overlay stays
     * non-focusable so the BACK key keeps reaching the app behind it.
     */
    private fun flagsFor(state: OverlayUiState): Int =
        if (state.inputVisible) {
            0
        } else {
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
        }
}
