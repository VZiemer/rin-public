package com.rinassistant.android.rin.assistant.remote

import com.rinassistant.android.R
import org.junit.Assert.*
import org.junit.Test

class BundledAvatarImagesTest {
    @Test fun resolvesCurrentAndPendingLegacyNames() {
        assertEquals(R.drawable.rin_10_weekend, BundledAvatarImages.drawableFor("RIN", "rin_10_weekend"))
        assertEquals(R.drawable.rin_11_halloween, BundledAvatarImages.drawableFor("RIN", "rin_11_halloween"))
        assertEquals(R.drawable.rin_12_sleep, BundledAvatarImages.drawableFor("RIN", "rin_12_sleep"))
        assertEquals(R.drawable.rin_10_weekend, BundledAvatarImages.drawableFor("RIN", "rin_holyday"))
        assertEquals(R.drawable.rin_11_halloween, BundledAvatarImages.drawableFor("RIN", "rin_halloween"))
        assertEquals(R.drawable.rin_12_sleep, BundledAvatarImages.drawableFor("RIN", "rin_pajamas"))
    }

    @Test fun neverOverridesOtherAssistantsOrUnrecognizedAssets() {
        assertNull(BundledAvatarImages.drawableFor("YUI", "rin_12_sleep"))
        assertNull(BundledAvatarImages.drawableFor("RIN", "rin_00_maid"))
        assertNull(BundledAvatarImages.drawableFor("RIN", ""))
        assertNull(BundledAvatarImages.drawableFor("RIN", null))
    }
}
