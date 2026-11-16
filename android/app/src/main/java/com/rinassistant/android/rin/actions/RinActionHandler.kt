package com.rinassistant.android.rin.actions

import com.rinassistant.android.rin.domain.model.RinAction

interface RinActionHandler {
    suspend fun handle(action: RinAction)
}
