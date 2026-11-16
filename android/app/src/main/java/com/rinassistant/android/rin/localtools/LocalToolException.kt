package com.rinassistant.android.rin.localtools

sealed class LocalToolException(message: String) : Exception(message) {
    class ToolNotFound(toolName: String) : LocalToolException(
        "Local tool '$toolName' is not registered.",
    )

    class InvalidInputType(
        toolName: String,
        expectedType: String,
        actualType: String,
    ) : LocalToolException(
        "Local tool '$toolName' expected input '$expectedType' but received '$actualType'.",
    )

    class InvalidOutputType(
        toolName: String,
        expectedType: String,
        actualType: String,
    ) : LocalToolException(
        "Local tool '$toolName' returned '$actualType' but declared '$expectedType'.",
    )
}
