package com.rinassistant.android.rin.localtools.usage

class UsageAccessStatusProvider(
    private val usageAccessController: UsageAccessController,
) {
    fun currentStatus(): UsageAccessStatus =
        if (usageAccessController.hasUsageAccess()) {
            UsageAccessStatus.GRANTED
        } else {
            UsageAccessStatus.NOT_GRANTED
        }
}
