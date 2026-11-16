package com.rinassistant.android.rin.assistant.remote

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Log
import com.rinassistant.android.rin.assistant.AssistantCatalog
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.io.File

class RemoteAvatarImages(context: Context) {
    private val resources = context.applicationContext.resources
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val mutex = Mutex()
    val cache = RemoteImageCache(File(context.noBackupFilesDir, "remote-avatars")) { file ->
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.path, bounds)
        bounds.outMimeType in setOf("image/png", "image/webp", "image/jpeg") &&
            bounds.outWidth in 1..4096 && bounds.outHeight in 1..4096 &&
            bounds.outWidth.toLong() * bounds.outHeight <= 12_000_000 && decode(file) != null
    }
    private val mutableBitmaps = MutableStateFlow<Map<String, Bitmap>>(emptyMap())
    val bitmaps = mutableBitmaps.asStateFlow()
    private val loadedPaths = mutableMapOf<String, String>()

    init { scope.launch { refresh() } }

    fun select(assistantId: String, name: String) {
        // Persist the intent even when its download has not arrived yet.
        cache.select(assistantId, name)
        scope.launch { refresh() }
    }

    fun selectIfPresent(assistantId: String, name: String?) {
        if (name == null) return
        try { select(assistantId, name) }
        catch (_: IllegalArgumentException) { Log.w("RinImages", "image_selection_rejected") }
    }

    suspend fun refresh() = mutex.withLock {
        val images = mutableBitmaps.value.toMutableMap()
        for (assistant in AssistantCatalog.all()) {
            val bundled = BundledAvatarImages.drawableFor(assistant.id, cache.selectedName(assistant.id))
            if (bundled != null) {
                val path = "bundled:$bundled"
                if (loadedPaths[assistant.id] != path) {
                    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true; inScaled = false }
                    BitmapFactory.decodeResource(resources, bundled, bounds)
                    val options = BitmapFactory.Options().apply { inSampleSize = 1; inScaled = false }
                    while (maxOf(bounds.outWidth, bounds.outHeight) / options.inSampleSize > 2048) options.inSampleSize *= 2
                    val bitmap = BitmapFactory.decodeResource(resources, bundled, options)
                    if (bitmap != null) {
                        images[assistant.id] = bitmap
                        loadedPaths[assistant.id] = path
                    } else {
                        images.remove(assistant.id)
                        loadedPaths.remove(assistant.id)
                    }
                }
                continue
            }
            val file = cache.selectedFile(assistant.id)
            if (file == null) {
                images.remove(assistant.id)
                loadedPaths.remove(assistant.id)
            } else if (loadedPaths[assistant.id] != file.path) {
                val bitmap = decode(file)
                if (bitmap != null) {
                    images[assistant.id] = bitmap
                    loadedPaths[assistant.id] = file.path
                } else {
                    images.remove(assistant.id)
                    loadedPaths.remove(assistant.id)
                    Log.w("RinImages", "image_decode_failed")
                }
            }
        }
        mutableBitmaps.value = images
    }

    private fun decode(file: File): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.path, bounds)
        if (bounds.outWidth !in 1..4096 || bounds.outHeight !in 1..4096) return null
        val options = BitmapFactory.Options().apply { inSampleSize = 1 }
        while (maxOf(bounds.outWidth, bounds.outHeight) / options.inSampleSize > 2048) options.inSampleSize *= 2
        return BitmapFactory.decodeFile(file.path, options)
    }
}
