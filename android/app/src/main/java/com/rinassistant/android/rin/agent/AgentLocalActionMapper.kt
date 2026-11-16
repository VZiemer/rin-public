package com.rinassistant.android.rin.agent

import com.rinassistant.android.rin.domain.model.RinAction
import com.rinassistant.android.rin.localtools.alarm.SetAlarmTool
import com.rinassistant.android.rin.localtools.focus.StartFocusSessionInput

class AgentLocalActionMapper {
    fun map(action: AgentAction): RinAction? {
        if (action.type != "LOCAL_TOOL") return null
        return when (action.tool) {
            "focus.start" -> {
                if (action.payload.keys != setOf("minutes")) return null
                val minutes = action.payload.integer("minutes") ?: return null
                if (runCatching { StartFocusSessionInput(minutes) }.isFailure) return null
                RinAction.StartFocus(minutes)
            }
            SetAlarmTool.NAME -> {
                if (action.payload.keys != setOf("hour", "minutes")) return null
                val hour = action.payload.integer("hour") ?: return null
                val minute = action.payload.integer("minutes") ?: return null
                if (hour !in 0..23 || minute !in 0..59) return null
                RinAction.SetAlarm(hour, minute)
            }
            else -> null
        }
    }
    private fun Map<String, Any?>.integer(key: String): Int? = when (val value = get(key)) {
        is Int -> value
        is Long -> if (value in Int.MIN_VALUE..Int.MAX_VALUE) value.toInt() else null
        else -> null
    }
}
