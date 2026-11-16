package com.rinassistant.android.rin.localtools.focus

import kotlin.math.max

class FocusTimer(
    private val clock: FocusClock,
) {
    fun remainingMillis(session: FocusSession): Long =
        when (session.status) {
            FocusStatus.RUNNING -> max(0L, session.endsAtMillis - clock.nowMillis())
            FocusStatus.PAUSED -> max(0L, session.endsAtMillis - requireNotNull(session.pausedAtMillis))
            FocusStatus.COMPLETED,
            FocusStatus.CANCELLED,
            FocusStatus.IDLE,
            -> 0L
        }

    fun isExpired(session: FocusSession): Boolean =
        session.status == FocusStatus.RUNNING && remainingMillis(session) == 0L
}
