package com.rinassistant.android.rin.localtools

class LocalActionDispatcher(
    private val registry: LocalToolRegistry,
) {
    suspend fun <I : Any, O : Any> dispatch(
        toolName: String,
        input: I,
    ): Result<O> {
        val tool = registry.find(toolName)
            ?: return Result.failure(LocalToolException.ToolNotFound(toolName))

        if (!tool.inputType.isInstance(input)) {
            return Result.failure(
                LocalToolException.InvalidInputType(
                    toolName = tool.name,
                    expectedType = tool.inputType.qualifiedName.orEmpty(),
                    actualType = input::class.qualifiedName.orEmpty(),
                ),
            )
        }

        return executeTyped(tool, input)
    }

    @Suppress("UNCHECKED_CAST")
    private suspend fun <I : Any, O : Any> executeTyped(
        tool: LocalTool<*, *>,
        input: I,
    ): Result<O> {
        val typedTool = tool as LocalTool<I, *>
        val result = typedTool.execute(input)
        val value = result.getOrElse { error ->
            return Result.failure(error)
        }

        if (!tool.outputType.isInstance(value)) {
            return Result.failure(
                LocalToolException.InvalidOutputType(
                    toolName = tool.name,
                    expectedType = tool.outputType.qualifiedName.orEmpty(),
                    actualType = value::class.qualifiedName.orEmpty(),
                ),
            )
        }

        return Result.success(value as O)
    }
}
