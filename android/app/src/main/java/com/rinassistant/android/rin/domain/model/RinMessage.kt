package com.rinassistant.android.rin.domain.model

data class RinMessage(
    val id: String,
    val text: String,
    val avatarState: AvatarState,
    val priority: RinPriority,
    val actions: List<RinActionDescriptor>,
    val requiresAction: Boolean = actions.isNotEmpty(),
    val assistantId: String = "RIN",
) {
    init {
        require(actions.size <= MAX_ACTIONS) {
            "RinMessage supports at most $MAX_ACTIONS actions."
        }
    }

    companion object {
        const val MAX_ACTIONS = 3
    }
}
