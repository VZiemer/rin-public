package com.rinassistant.android.rin.localtools.focus

import java.util.UUID

class FocusController(
    private val repository: FocusRepository,
    private val clock: FocusClock,
    private val timer: FocusTimer = FocusTimer(clock),
    private val storage: FocusSessionStorage = NoOpFocusSessionStorage(),
    private val idProvider: () -> String = { UUID.randomUUID().toString() },
) {
    suspend fun start(input: StartFocusSessionInput): FocusSession {
        val now = clock.nowMillis()
        val duration = input.durationMillis()
        return FocusSession(
            id = idProvider(),
            durationMillis = duration,
            startedAtMillis = now,
            endsAtMillis = now + duration,
            status = FocusStatus.RUNNING,
        ).also { session ->
            repository.save(session)
            storage.save(session)
        }
    }

    suspend fun pause(): Result<FocusSession> {
        val session = currentSessionOrFailure().getOrElse { return Result.failure(it) }
        if (session.status != FocusStatus.RUNNING) {
            return Result.failure(FocusException.InvalidStatus(FocusStatus.RUNNING, session.status))
        }

        return Result.success(
            session.copy(
                status = FocusStatus.PAUSED,
                pausedAtMillis = clock.nowMillis(),
            ).also { pausedSession ->
                repository.save(pausedSession)
                storage.save(pausedSession)
            },
        )
    }

    suspend fun resume(): Result<FocusSession> {
        val session = currentSessionOrFailure().getOrElse { return Result.failure(it) }
        if (session.status != FocusStatus.PAUSED) {
            return Result.failure(FocusException.InvalidStatus(FocusStatus.PAUSED, session.status))
        }

        val remaining = timer.remainingMillis(session)
        val now = clock.nowMillis()
        return Result.success(
            session.copy(
                status = FocusStatus.RUNNING,
                endsAtMillis = now + remaining,
                pausedAtMillis = null,
            ).also { resumedSession ->
                repository.save(resumedSession)
                storage.save(resumedSession)
            },
        )
    }

    suspend fun cancel(): Result<FocusSession> {
        val session = currentSessionOrFailure().getOrElse { return Result.failure(it) }
        return Result.success(
            session.copy(
                status = FocusStatus.CANCELLED,
                pausedAtMillis = null,
            ).also { cancelledSession ->
                repository.save(cancelledSession)
                storage.save(cancelledSession)
            },
        )
    }

    suspend fun completeIfExpired(): Result<FocusSession> {
        val session = currentSessionOrFailure().getOrElse { return Result.failure(it) }
        if (!timer.isExpired(session)) {
            return Result.success(session)
        }

        return Result.success(
            session.copy(
                status = FocusStatus.COMPLETED,
                pausedAtMillis = null,
            ).also { completedSession ->
                repository.save(completedSession)
                storage.save(completedSession)
            },
        )
    }

    fun remainingMillis(): Result<Long> {
        val session = currentSessionOrFailure().getOrElse { return Result.failure(it) }
        return Result.success(timer.remainingMillis(session))
    }

    private fun currentSessionOrFailure(): Result<FocusSession> {
        val session = repository.currentSession.value
            ?: return Result.failure(FocusException.NoActiveSession)
        return Result.success(session)
    }
}
