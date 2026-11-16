package com.rinassistant.android.rin.localtools

import kotlin.reflect.KClass

data class EchoInput(val value: String)

data class EchoOutput(val value: String)

data object OtherInput

class EchoTool(
    override val name: String,
) : LocalTool<EchoInput, EchoOutput> {
    override val inputType: KClass<EchoInput> = EchoInput::class
    override val outputType: KClass<EchoOutput> = EchoOutput::class

    override suspend fun execute(input: EchoInput): Result<EchoOutput> =
        Result.success(EchoOutput(input.value))
}

class FailingTool(
    override val name: String,
) : LocalTool<EchoInput, EchoOutput> {
    override val inputType: KClass<EchoInput> = EchoInput::class
    override val outputType: KClass<EchoOutput> = EchoOutput::class

    override suspend fun execute(input: EchoInput): Result<EchoOutput> =
        Result.failure(IllegalStateException("Nope."))
}
