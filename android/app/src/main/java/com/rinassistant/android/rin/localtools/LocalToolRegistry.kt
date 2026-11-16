package com.rinassistant.android.rin.localtools

class LocalToolRegistry(
    tools: List<LocalTool<*, *>>,
) {
    private val toolsByName: Map<String, LocalTool<*, *>>

    init {
        val duplicateNames = tools
            .groupBy { it.name }
            .filterValues { it.size > 1 }
            .keys
        require(duplicateNames.isEmpty()) {
            "Duplicate local tools registered: ${duplicateNames.joinToString()}."
        }
        toolsByName = tools.associateBy { it.name }
    }

    val toolNames: Set<String> = toolsByName.keys

    fun find(name: String): LocalTool<*, *>? = toolsByName[name]
}
