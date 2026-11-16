package com.rinassistant.android.rin.localtools

import kotlin.reflect.KClass

interface LocalTool<I : Any, O : Any> {
    val name: String
    val inputType: KClass<I>
    val outputType: KClass<O>

    suspend fun execute(input: I): Result<O>
}
