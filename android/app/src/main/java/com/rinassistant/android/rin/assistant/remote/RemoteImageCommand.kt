package com.rinassistant.android.rin.assistant.remote

import java.net.URI
import java.util.Locale

sealed interface RemoteImageCommand {
    val assistantId: String
    data class Available(override val assistantId: String, val name: String, val url: String, val sha256: String) : RemoteImageCommand
    data class Select(override val assistantId: String, val name: String) : RemoteImageCommand

    companion object {
        const val AVAILABLE = "avatar_image_available"
        const val SELECT = "avatar_image_select"
        fun isCommand(data: Map<String, String>) = data["type"] in setOf(AVAILABLE, SELECT)
        fun validName(name: String) = Regex("[A-Za-z0-9][A-Za-z0-9_.-]{0,95}").matches(name)
        fun assistantId(value: String?): String = (value ?: "RIN").trim().uppercase(Locale.ROOT).also {
            require(it in setOf("RIN", "YUI"))
        }
        fun parse(data: Map<String, String>): RemoteImageCommand {
            val assistant = assistantId(data["assistantId"])
            val name = requireNotNull(data["imageName"])
            return when (data["type"]) {
                AVAILABLE -> {
                    require(validName(name))
                    val url = requireNotNull(data["imageUrl"])
                    require(url.length <= 4096)
                    val uri = URI(url)
                    require(uri.scheme == "https" && !uri.host.isNullOrBlank() && uri.userInfo == null && uri.fragment == null)
                    val hash = requireNotNull(data["imageSha256"]).lowercase(Locale.ROOT)
                    require(Regex("[a-f0-9]{64}").matches(hash))
                    Available(assistant, name, url, hash)
                }
                SELECT -> {
                    require(name.isEmpty() || validName(name))
                    Select(assistant, name)
                }
                else -> throw IllegalArgumentException("Unknown image command")
            }
        }
    }
}
