package com.rinassistant.android.rin.localtools.focus.distraction

import com.rinassistant.android.rin.localtools.focus.FocusClock
import com.rinassistant.android.rin.localtools.usage.AppUsageReader
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class FocusDistractionMonitor(
    private val appUsageReader: AppUsageReader,
    private val distractionPolicy: DistractionPolicy,
    private val clock: FocusClock,
    private val checkIntervalMillis: Long = DEFAULT_CHECK_INTERVAL_MILLIS,
    private val reactionCooldownMillis: Long = DEFAULT_REACTION_COOLDOWN_MILLIS,
) {
    private val mutableLastEvent = MutableStateFlow<DistractionEvent?>(null)
    val lastEvent: StateFlow<DistractionEvent?> = mutableLastEvent.asStateFlow()
    private var lastCheckAtMillis: Long? = null
    private var lastReactionAtMillis: Long? = null
    private var reactionCount = 0

    suspend fun checkForDistraction(): DistractionEvent? {
        val now = clock.nowMillis()
        val previousCheck = lastCheckAtMillis
        if (previousCheck != null && now - previousCheck < checkIntervalMillis) {
            return null
        }
        lastCheckAtMillis = now

        val packageName = appUsageReader.getCurrentForegroundPackage() ?: return null
        if (distractionPolicy.classify(packageName) != AppFocusClassification.DISTRACTING) {
            return null
        }

        val previousReaction = lastReactionAtMillis
        if (previousReaction != null && now - previousReaction < reactionCooldownMillis) {
            return null
        }

        lastReactionAtMillis = now
        reactionCount += 1
        return DistractionEvent(
            packageName = packageName,
            detectedAtMillis = now,
            sequenceNumber = reactionCount,
        ).also { event ->
            mutableLastEvent.value = event
        }
    }

    fun reset() {
        mutableLastEvent.value = null
        lastCheckAtMillis = null
        lastReactionAtMillis = null
        reactionCount = 0
    }

    companion object {
        const val DEFAULT_CHECK_INTERVAL_MILLIS = 15_000L
        const val DEFAULT_REACTION_COOLDOWN_MILLIS = 45_000L
    }
}
