package com.rinassistant.android.rin.localtools.usage

import android.content.Intent
import org.junit.Assert.assertEquals
import org.junit.Test

class UsageAccessStatusProviderTest {
    @Test
    fun returnsGrantedWhenControllerHasUsageAccess() {
        val provider = UsageAccessStatusProvider(
            FakeUsageAccessController(hasUsageAccess = true),
        )

        assertEquals(UsageAccessStatus.GRANTED, provider.currentStatus())
    }

    @Test
    fun returnsNotGrantedWhenControllerDoesNotHaveUsageAccess() {
        val provider = UsageAccessStatusProvider(
            FakeUsageAccessController(hasUsageAccess = false),
        )

        assertEquals(UsageAccessStatus.NOT_GRANTED, provider.currentStatus())
    }

    private class FakeUsageAccessController(
        private val hasUsageAccess: Boolean,
    ) : UsageAccessController {
        override fun hasUsageAccess(): Boolean = hasUsageAccess

        override fun createUsageAccessSettingsIntent(): Intent =
            error("Settings intent is not needed for status tests.")
    }
}
