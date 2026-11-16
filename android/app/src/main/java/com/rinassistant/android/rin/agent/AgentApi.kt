package com.rinassistant.android.rin.agent

data class AgentMessageRequest(val message: String, val deviceId: String, val assistantId: String = "RIN")
data class AgentAction(val type: String, val tool: String, val payload: Map<String, Any?>)
data class AgentMessageResponse(
    val message: String,
    val avatarState: String,
    val priority: String,
    val actions: List<AgentAction>,
    val assistantId: String = "RIN",
    val imageName: String? = null,
)

fun interface AgentApi { suspend fun send(request: AgentMessageRequest): AgentMessageResponse }

enum class AgentFailure { NOT_CONFIGURED, TIMEOUT, OFFLINE, MALFORMED_RESPONSE, BACKEND, ASSISTANT_NOT_FOUND, UNAUTHENTICATED }
class AgentException(val reason: AgentFailure) : Exception(reason.name)

class AgentRepository(
    private val api: AgentApi,
    private val deviceId: String,
    private val assistantIdProvider: () -> String = { "RIN" },
) {
    suspend fun send(message: String): AgentMessageResponse {
        if (deviceId.isBlank()) throw AgentException(AgentFailure.NOT_CONFIGURED)
        require(message.isNotBlank())
        return api.send(AgentMessageRequest(message.trim(), deviceId, assistantIdProvider()))
    }
}
