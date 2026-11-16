package com.rinassistant.android.rin.assistant.remote

import java.io.File
import java.io.InputStream
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.MessageDigest
import java.util.Properties

/** Names are immutable within an assistant. A changed image must have a new name. */
class RemoteImageCache(private val directory: File, private val validate: (File) -> Boolean) {
    private val indexFile = File(directory, "index.properties")
    private val index = Properties()

    init {
        check(directory.isDirectory || directory.mkdirs())
        if (indexFile.exists()) indexFile.inputStream().use { index.load(it) }
    }

    @Synchronized fun select(assistantId: String, name: String) {
        val assistant = RemoteImageCommand.assistantId(assistantId)
        require(name.isEmpty() || RemoteImageCommand.validName(name))
        index.setProperty("selected.$assistant", name)
        persist()
    }

    @Synchronized fun selectedFile(assistantId: String): File? {
        val assistant = RemoteImageCommand.assistantId(assistantId)
        val name = index.getProperty("selected.$assistant", "")
        if (name.isEmpty()) return null
        val hash = index.getProperty("asset.$assistant.$name") ?: return null
        return File(directory, "$hash.img").takeIf { it.isFile }
    }

    @Synchronized fun selectedName(assistantId: String): String =
        index.getProperty("selected.${RemoteImageCommand.assistantId(assistantId)}", "")

    @Synchronized fun contains(image: RemoteImageCommand.Available): Boolean {
        val hash = index.getProperty("asset.${image.assistantId}.${image.name}") ?: return false
        require(hash == image.sha256) { "Image names are immutable" }
        return File(directory, "$hash.img").isFile
    }

    fun install(image: RemoteImageCommand.Available, input: InputStream) {
        val temp = File.createTempFile("download-", ".tmp", directory)
        try {
            val digest = MessageDigest.getInstance("SHA-256")
            var size = 0L
            temp.outputStream().use { output ->
                val buffer = ByteArray(8192)
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    size += count
                    require(size <= MAX_BYTES) { "Image exceeds 8 MiB" }
                    digest.update(buffer, 0, count)
                    output.write(buffer, 0, count)
                }
            }
            val hash = digest.digest().joinToString("") { "%02x".format(it) }
            require(hash == image.sha256) { "Image checksum mismatch" }
            require(validate(temp)) { "Unsupported or invalid image" }
            synchronized(this) {
                val key = "asset.${image.assistantId}.${image.name}"
                val previous = index.getProperty(key)
                require(previous == null || previous == hash) { "Image names are immutable" }
                val target = File(directory, "$hash.img")
                if (!target.exists()) {
                    val used = directory.listFiles()?.filter { it.extension == "img" }?.sumOf { it.length() } ?: 0L
                    require(used + size <= 128L * 1024 * 1024) { "Image cache is full" }
                    Files.move(temp.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE)
                }
                index.setProperty(key, hash)
                persist()
            }
        } finally {
            temp.delete()
        }
    }

    private fun persist() {
        val temp = File(directory, "index.tmp")
        temp.outputStream().use { index.store(it, null) }
        Files.move(temp.toPath(), indexFile.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
    }

    companion object { const val MAX_BYTES = 8L * 1024 * 1024 }
}
