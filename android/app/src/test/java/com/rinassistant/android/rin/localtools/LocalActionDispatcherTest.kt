package com.rinassistant.android.rin.localtools

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LocalActionDispatcherTest {
    @Test
    fun dispatchExecutesRegisteredTool() = runBlocking {
        val dispatcher = LocalActionDispatcher(
            LocalToolRegistry(
                tools = listOf(EchoTool(name = "device.echo")),
            ),
        )

        val result = dispatcher.dispatch<EchoInput, EchoOutput>(
            toolName = "device.echo",
            input = EchoInput("hello"),
        )

        assertEquals(EchoOutput("hello"), result.getOrThrow())
    }

    @Test
    fun dispatchReturnsFailureForUnknownTool() = runBlocking {
        val dispatcher = LocalActionDispatcher(LocalToolRegistry(tools = emptyList()))

        val result = dispatcher.dispatch<EchoInput, EchoOutput>(
            toolName = "missing",
            input = EchoInput("hello"),
        )

        assertTrue(result.exceptionOrNull() is LocalToolException.ToolNotFound)
    }

    @Test
    fun dispatchReturnsFailureForWrongInputType() = runBlocking {
        val dispatcher = LocalActionDispatcher(
            LocalToolRegistry(
                tools = listOf(EchoTool(name = "device.echo")),
            ),
        )

        val result = dispatcher.dispatch<OtherInput, EchoOutput>(
            toolName = "device.echo",
            input = OtherInput,
        )

        assertTrue(result.exceptionOrNull() is LocalToolException.InvalidInputType)
    }

    @Test
    fun dispatchPreservesToolFailure() = runBlocking {
        val dispatcher = LocalActionDispatcher(
            LocalToolRegistry(
                tools = listOf(FailingTool(name = "device.fail")),
            ),
        )

        val result = dispatcher.dispatch<EchoInput, EchoOutput>(
            toolName = "device.fail",
            input = EchoInput("hello"),
        )

        assertEquals("Nope.", result.exceptionOrNull()?.message)
    }
}
