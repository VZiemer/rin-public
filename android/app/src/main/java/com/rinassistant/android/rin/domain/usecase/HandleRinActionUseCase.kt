package com.rinassistant.android.rin.domain.usecase

import com.rinassistant.android.rin.actions.RinActionHandler
import com.rinassistant.android.rin.domain.model.RinAction

class HandleRinActionUseCase(
    private val actionHandler: RinActionHandler,
) {
    suspend fun handle(action: RinAction) {
        actionHandler.handle(action)
    }
}
