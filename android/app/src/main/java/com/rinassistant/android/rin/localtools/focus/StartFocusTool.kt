package com.rinassistant.android.rin.localtools.focus

import com.rinassistant.android.rin.localtools.LocalTool
import kotlinx.coroutines.CancellationException

class StartFocusTool(private val start: suspend (StartFocusSessionInput) -> Unit) : LocalTool<StartFocusSessionInput, Unit> {
    override val name = NAME
    override val inputType = StartFocusSessionInput::class
    override val outputType = Unit::class
    override suspend fun execute(input: StartFocusSessionInput): Result<Unit> = try {
        start(input); Result.success(Unit)
    } catch (error: CancellationException) { throw error }
    catch (error: Exception) { Result.failure(error) }
    companion object { const val NAME = "focus.start" }
}
