package com.rinassistant.android.rin.assistant.remote

import androidx.annotation.DrawableRes
import com.rinassistant.android.R

/** Local replacements also cover older messages that are still pending on the device. */
object BundledAvatarImages {
    @DrawableRes
    fun drawableFor(assistantId: String, name: String?): Int? {
        if (assistantId != "RIN") return null
        return when (name) {
            "rin_10_weekend", "rin_holyday" -> R.drawable.rin_10_weekend
            "rin_11_halloween", "rin_halloween" -> R.drawable.rin_11_halloween
            "rin_12_sleep", "rin_pajamas" -> R.drawable.rin_12_sleep
            else -> null
        }
    }
}
