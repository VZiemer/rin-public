package com.rinassistant.android.rin.localtools.alarm

import com.rinassistant.android.rin.localtools.LocalTool
import kotlin.reflect.KClass

class GetNextAlarmTool(
    private val alarmController: AlarmController,
) : LocalTool<GetNextAlarmInput, GetNextAlarmOutput> {
    override val name: String = NAME
    override val inputType: KClass<GetNextAlarmInput> = GetNextAlarmInput::class
    override val outputType: KClass<GetNextAlarmOutput> = GetNextAlarmOutput::class

    override suspend fun execute(input: GetNextAlarmInput): Result<GetNextAlarmOutput> =
        Result.success(GetNextAlarmOutput(alarmController.getNextAlarm()))

    companion object {
        const val NAME = "device.get_next_alarm"
    }
}

class OpenAlarmsTool(
    private val alarmController: AlarmController,
) : LocalTool<OpenAlarmsInput, Unit> {
    override val name: String = NAME
    override val inputType: KClass<OpenAlarmsInput> = OpenAlarmsInput::class
    override val outputType: KClass<Unit> = Unit::class

    override suspend fun execute(input: OpenAlarmsInput): Result<Unit> =
        alarmController.openAlarms()

    companion object {
        const val NAME = "device.open_alarms"
    }
}

class SetAlarmTool(
    private val alarmController: AlarmController,
) : LocalTool<SetAlarmInput, Unit> {
    override val name: String = NAME
    override val inputType: KClass<SetAlarmInput> = SetAlarmInput::class
    override val outputType: KClass<Unit> = Unit::class

    override suspend fun execute(input: SetAlarmInput): Result<Unit> =
        alarmController.setAlarm(input)

    companion object {
        const val NAME = "device.set_alarm"
    }
}
