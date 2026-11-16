package com.rinassistant.android.rin.overlay.renderer

import android.content.Context
import androidx.annotation.DrawableRes
import com.rinassistant.android.rin.assistant.AssistantCatalog
import com.rinassistant.android.rin.domain.model.AvatarState
import com.rinassistant.android.rin.localtools.focus.FocusStatus

/** Rin-only adapter over [AssistantAssetResolver]. */
class RinAssetResolver(
    context: Context? = null,
) {
    private val delegate = AssistantAssetResolver(context)

    @DrawableRes
    fun drawableFor(state: AvatarState): Int =
        delegate.drawableFor(AssistantCatalog.DEFAULT_ID, state)

    fun scaleFor(@DrawableRes drawable: Int): Float =
        delegate.scaleFor(AssistantCatalog.DEFAULT_ID, drawable)

    @DrawableRes
    fun focusDrawableFor(status: FocusStatus, state: AvatarState): Int =
        delegate.focusDrawableFor(AssistantCatalog.DEFAULT_ID, status, state)

}
