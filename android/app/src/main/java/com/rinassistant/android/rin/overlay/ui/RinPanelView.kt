package com.rinassistant.android.rin.overlay.ui

import android.content.Context
import android.view.KeyEvent
import android.widget.FrameLayout
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.lifecycle.setViewTreeLifecycleOwner
import androidx.lifecycle.setViewTreeViewModelStoreOwner
import androidx.savedstate.setViewTreeSavedStateRegistryOwner
import com.rinassistant.android.rin.ui.theme.RinTheme

/**
 * Hosts the [RinPanel] composable inside a [android.view.WindowManager] overlay window.
 * Provides its own lifecycle/saved-state owners and forwards the BACK key to [RinPanelCallbacks.onClose].
 */
class RinPanelView(
    context: Context,
    private val callbacks: RinPanelCallbacks,
) : FrameLayout(context) {

    private val lifecycleOwner = OverlayLifecycleOwner()
    private val modelState = mutableStateOf<RinPanelUiModel?>(null)

    private val composeView = ComposeView(context).apply {
        setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed)
        setContent {
            RinTheme {
                modelState.value?.let { RinPanel(it, callbacks) }
            }
        }
    }

    init {
        isFocusableInTouchMode = true
        setViewTreeLifecycleOwner(lifecycleOwner)
        setViewTreeSavedStateRegistryOwner(lifecycleOwner)
        setViewTreeViewModelStoreOwner(lifecycleOwner)
        addView(composeView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    }

    fun render(model: RinPanelUiModel) {
        modelState.value = model
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        lifecycleOwner.onAttached()
    }

    override fun onDetachedFromWindow() {
        lifecycleOwner.onDetached()
        super.onDetachedFromWindow()
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode == KeyEvent.KEYCODE_BACK && event.action == KeyEvent.ACTION_UP) {
            callbacks.onClose()
            return true
        }
        return super.dispatchKeyEvent(event)
    }
}
