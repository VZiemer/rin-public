package com.rinassistant.android.rin.assistant.remote

import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.ByteArrayInputStream
import java.io.IOException
import java.io.InputStream
import java.security.MessageDigest

class RemoteImageCacheTest {
    @get:Rule val temp = TemporaryFolder()
    private val bytes = "test-image-content".toByteArray()
    private fun image(name: String = "halloween", assistant: String = "RIN", content: ByteArray = bytes) =
        RemoteImageCommand.Available(assistant, name, "https://example.com/image.png",
            MessageDigest.getInstance("SHA-256").digest(content).joinToString("") { "%02x".format(it) })

    @Test fun downloadingDoesNotActivateAndSelectionSurvivesRestart() {
        val directory = temp.newFolder()
        val cache = RemoteImageCache(directory) { true }
        cache.install(image(), ByteArrayInputStream(bytes))
        assertNull(cache.selectedFile("RIN"))
        cache.select("RIN", "halloween")
        assertArrayEquals(bytes, RemoteImageCache(directory) { true }.selectedFile("RIN")!!.readBytes())
    }

    @Test fun selectingBeforeDownloadFallsBackThenResolvesWithoutAnotherSelection() {
        val cache = RemoteImageCache(temp.newFolder()) { true }
        cache.select("RIN", "halloween")
        assertNull(cache.selectedFile("RIN"))
        cache.install(image(), ByteArrayInputStream(bytes))
        assertNotNull(cache.selectedFile("RIN"))
        cache.select("RIN", "")
        assertNull(cache.selectedFile("RIN"))
    }

    @Test fun assistantsHaveIndependentSelectionsAndNames() {
        val cache = RemoteImageCache(temp.newFolder()) { true }
        cache.install(image(), ByteArrayInputStream(bytes))
        cache.select("RIN", "halloween")
        cache.select("YUI", "halloween")
        assertNotNull(cache.selectedFile("RIN"))
        assertNull(cache.selectedFile("YUI"))
    }

    @Test fun wrongHashInvalidImageAndInterruptedDownloadNeverPublishPartialFiles() {
        val directory = temp.newFolder()
        val cache = RemoteImageCache(directory) { true }
        assertThrows(IllegalArgumentException::class.java) {
            cache.install(image(), ByteArrayInputStream("wrong".toByteArray()))
        }
        assertThrows(IllegalArgumentException::class.java) {
            RemoteImageCache(directory) { false }.install(image(), ByteArrayInputStream(bytes))
        }
        assertThrows(IOException::class.java) {
            cache.install(image(), object : InputStream() { override fun read(): Int = throw IOException("offline") })
        }
        assertFalse(cache.contains(image()))
        assertTrue(directory.listFiles()!!.isEmpty())
    }

    @Test fun rejectsOversizedStreamWithoutPublishingIt() {
        val cache = RemoteImageCache(temp.newFolder()) { true }
        assertThrows(IllegalArgumentException::class.java) {
            cache.install(image(), object : InputStream() {
                override fun read() = 0
                override fun read(buffer: ByteArray, offset: Int, length: Int) = length
            })
        }
        assertFalse(cache.contains(image()))
    }

    @Test fun duplicateIsIdempotentButDifferentContentRequiresANewName() {
        val cache = RemoteImageCache(temp.newFolder()) { true }
        cache.install(image(), ByteArrayInputStream(bytes))
        cache.install(image(), ByteArrayInputStream(bytes))
        assertTrue(cache.contains(image()))
        val changed = "new-image".toByteArray()
        assertThrows(IllegalArgumentException::class.java) {
            cache.install(image(content = changed), ByteArrayInputStream(changed))
        }
        cache.select("RIN", "halloween")
        assertArrayEquals(bytes, cache.selectedFile("RIN")!!.readBytes())
    }

    @Test fun absentFileFallsBackInsteadOfReturningABrokenPath() {
        val cache = RemoteImageCache(temp.newFolder()) { true }
        cache.install(image(), ByteArrayInputStream(bytes))
        cache.select("RIN", "halloween")
        cache.selectedFile("RIN")!!.delete()
        assertNull(cache.selectedFile("RIN"))
        assertFalse(cache.contains(image()))
    }
}
