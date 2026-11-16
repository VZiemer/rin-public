package com.rinassistant.android.rin.localtools.alarm

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AlarmToolTest {
    @Test
    fun getNextAlarmReturnsControllerAlarm() = runBlocking {
        val alarm = DeviceAlarm(
            triggerAtMillis = 1234L,
            formattedTime = "07:30",
        )
        val tool = GetNextAlarmTool(FakeAlarmController(nextAlarm = alarm))

        val result = tool.execute(GetNextAlarmInput)

        assertEquals(GetNextAlarmOutput(alarm), result.getOrThrow())
    }

    @Test
    fun getNextAlarmReturnsNullWhenNoAlarmExists() = runBlocking {
        val tool = GetNextAlarmTool(FakeAlarmController(nextAlarm = null))

        val result = tool.execute(GetNextAlarmInput)

        assertEquals(GetNextAlarmOutput(null), result.getOrThrow())
    }

    @Test
    fun openAlarmsDelegatesToController() = runBlocking {
        val controller = FakeAlarmController()
        val tool = OpenAlarmsTool(controller)

        val result = tool.execute(OpenAlarmsInput)

        assertTrue(result.isSuccess)
        assertEquals(1, controller.openCalls)
    }

    @Test
    fun setAlarmDelegatesToController() = runBlocking {
        val controller = FakeAlarmController()
        val tool = SetAlarmTool(controller)
        val input = SetAlarmInput(
            hour = 9,
            minutes = 45,
            message = "Stand up",
        )

        val result = tool.execute(input)

        assertTrue(result.isSuccess)
        assertEquals(input, controller.lastSetAlarmInput)
    }

    @Test
    fun setAlarmPreservesControllerFailure() = runBlocking {
        val error = AlarmToolException.NoCompatibleAlarmApp("android.intent.action.SET_ALARM")
        val tool = SetAlarmTool(
            FakeAlarmController(
                setAlarmResult = Result.failure(error),
            ),
        )

        val result = tool.execute(
            SetAlarmInput(
                hour = 9,
                minutes = 45,
                message = "Stand up",
            ),
        )

        assertEquals(error, result.exceptionOrNull())
    }

    private class FakeAlarmController(
        private val nextAlarm: DeviceAlarm? = null,
        private val openAlarmsResult: Result<Unit> = Result.success(Unit),
        private val setAlarmResult: Result<Unit> = Result.success(Unit),
    ) : AlarmController {
        var openCalls = 0
            private set
        var lastSetAlarmInput: SetAlarmInput? = null
            private set

        override fun getNextAlarm(): DeviceAlarm? = nextAlarm

        override fun openAlarms(): Result<Unit> {
            openCalls += 1
            return openAlarmsResult
        }

        override fun setAlarm(input: SetAlarmInput): Result<Unit> {
            lastSetAlarmInput = input
            return setAlarmResult
        }
    }
}
