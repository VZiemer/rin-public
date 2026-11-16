package com.rinassistant.android.rin.assistant.remote

import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test

class BundledAvatarDeviceTest {
    @Test fun selectionsDecodeBundledResourcesWithoutAnyDownloadAndSurviveRestart() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val images = RemoteAvatarImages(context)
        val previous = images.cache.selectedName("RIN")
        try {
            for (name in listOf("rin_10_weekend", "rin_11_halloween", "rin_12_sleep")) {
                images.select("RIN", name)
                images.refresh()
                val bitmap = images.bitmaps.value["RIN"]
                assertNotNull("Bundled resource must decode: $name", bitmap)
                assertTrue(bitmap!!.width > 0 && bitmap.height > 0)
                val restarted = RemoteAvatarImages(context)
                restarted.refresh()
                assertEquals(name, restarted.cache.selectedName("RIN"))
                assertNotNull(restarted.bitmaps.value["RIN"])
            }
            images.select("RIN", "")
            images.refresh()
            assertNull(images.bitmaps.value["RIN"])
        } finally {
            images.select("RIN", previous)
            images.refresh()
        }
    }
}
