package com.rinassistant.android.rin.overlay.renderer

import android.content.Context
import androidx.annotation.DrawableRes
import com.rinassistant.android.rin.assistant.AssistantCatalog
import com.rinassistant.android.rin.domain.model.AvatarState
import com.rinassistant.android.rin.localtools.focus.FocusStatus

class AssistantAssetResolver(
    private val context: Context? = null,
) {
    @DrawableRes
    fun drawableFor(assistantId: String, state: AvatarState): Int =
        AssistantCatalog.requireById(assistantId).avatarAssets.drawableFor(state)

    fun scaleFor(assistantId: String, @DrawableRes drawable: Int): Float {
        val assets = AssistantCatalog.requireById(assistantId).avatarAssets
        return if (drawable in assets.sittingDrawables) assets.sittingScale else 1f
    }

    @DrawableRes
    fun focusDrawableFor(assistantId: String, status: FocusStatus, state: AvatarState): Int {
        val assets = AssistantCatalog.requireById(assistantId).avatarAssets
        val resolved = assets.resolveState(state)
        if (resolved == AvatarState.SCOLDING || resolved == AvatarState.ANGRY_POUT) {
            return assets.drawableFor(resolved)
        }
        return if (status == FocusStatus.PAUSED) {
            optionalFocusDrawable(assets.focusPausedName, assets.focusPausedFallback)
        } else {
            optionalFocusDrawable(assets.focusRunningName, assets.focusRunningFallback)
        }
    }

    @DrawableRes
    private fun optionalFocusDrawable(resourceName: String?, @DrawableRes fallback: Int): Int {
        if (resourceName.isNullOrBlank()) return fallback
        val resources = context?.resources ?: return fallback
        val resolvedId = resources.getIdentifier(resourceName, "drawable", context.packageName)
        return if (resolvedId != 0) resolvedId else fallback
    }
}
