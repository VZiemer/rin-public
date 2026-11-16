package com.rinassistant.android.rin.localtools

import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test

class LocalToolRegistryTest {
    @Test
    fun exposesRegisteredToolNames() {
        val registry = LocalToolRegistry(
            tools = listOf(EchoTool(name = "device.echo")),
        )

        assertEquals(setOf("device.echo"), registry.toolNames)
    }

    @Test
    fun findsRegisteredToolByName() {
        val tool = EchoTool(name = "device.echo")
        val registry = LocalToolRegistry(tools = listOf(tool))

        assertSame(tool, registry.find("device.echo"))
    }

    @Test
    fun returnsNullForUnknownTool() {
        val registry = LocalToolRegistry(tools = emptyList())

        assertEquals(null, registry.find("missing"))
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsDuplicateToolNames() {
        LocalToolRegistry(
            tools = listOf(
                EchoTool(name = "device.echo"),
                EchoTool(name = "device.echo"),
            ),
        )
    }
}
