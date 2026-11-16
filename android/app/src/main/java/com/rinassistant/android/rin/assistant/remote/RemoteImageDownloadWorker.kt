package com.rinassistant.android.rin.assistant.remote

import android.content.Context
import android.util.Log
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.rinassistant.android.rin.app.RinApplication
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI

class RemoteImageDownloadWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        try {
            val command = RemoteImageCommand.parse(inputData.keyValueMap.mapValues { it.value as String }) as RemoteImageCommand.Available
            val images = (applicationContext as RinApplication).appContainer.remoteAvatarImages
            if (BundledAvatarImages.drawableFor(command.assistantId, command.name) != null) {
                images.refresh()
                return@withContext Result.success()
            }
            if (!images.cache.contains(command)) {
                val connection = URI(command.url).toURL().openConnection() as HttpURLConnection
                try {
                    connection.connectTimeout = 15_000
                    connection.readTimeout = 30_000
                    connection.instanceFollowRedirects = false
                    val status = connection.responseCode
                    if (status == 429 || status in 500..599) throw IOException("Temporary download failure")
                    require(status == 200) { "Image URL unavailable" }
                    require(connection.contentLengthLong <= RemoteImageCache.MAX_BYTES)
                    connection.inputStream.use { images.cache.install(command, it) }
                } finally { connection.disconnect() }
            }
            images.refresh()
            Log.i("RinImages", "image_download_ready name=${command.name}")
            Result.success()
        } catch (error: CancellationException) {
            throw error
        } catch (_: IOException) {
            Log.w("RinImages", "image_download_io_failure")
            if (runAttemptCount < 3) Result.retry() else Result.failure()
        } catch (_: Exception) {
            // Never log signed URLs or raw notification data.
            Log.w("RinImages", "image_download_rejected")
            Result.failure()
        }
    }

    companion object {
        fun enqueue(context: Context, image: RemoteImageCommand.Available) {
            val request = OneTimeWorkRequestBuilder<RemoteImageDownloadWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setInputData(workDataOf(
                    "type" to RemoteImageCommand.AVAILABLE, "assistantId" to image.assistantId,
                    "imageName" to image.name, "imageUrl" to image.url, "imageSha256" to image.sha256,
                )).build()
            WorkManager.getInstance(context).enqueueUniqueWork(
                "avatar-${image.assistantId}-${image.name}", ExistingWorkPolicy.REPLACE, request,
            )
        }
    }
}
