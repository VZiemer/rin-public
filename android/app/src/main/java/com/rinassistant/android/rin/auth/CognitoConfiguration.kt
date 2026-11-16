package com.rinassistant.android.rin.auth

import java.net.URI
import java.util.Base64
import org.json.JSONObject

data class CognitoConfiguration(val clientId: String, val region: String) {
    companion object {
        /** Recover public routing metadata from a previously stored session, never authenticate locally. */
        fun resolve(clientId: String, region: String, savedSession: AuthSession?): CognitoConfiguration {
            if (clientId.isNotBlank()) return CognitoConfiguration(clientId, region.ifBlank { "us-east-1" })
            val recovered = runCatching {
                val token = requireNotNull(savedSession).accessToken.split('.')
                require(token.size == 3)
                val payload = JSONObject(String(Base64.getUrlDecoder().decode(token[1]), Charsets.UTF_8))
                val issuer = URI(payload.getString("iss"))
                val host = requireNotNull(issuer.host)
                val match = Regex("cognito-idp\\.([a-z]{2}(?:-[a-z]+)+-[0-9]+)\\.amazonaws\\.com").matchEntire(host)
                val savedRegion = requireNotNull(match).groupValues[1]
                require(issuer.scheme == "https" && issuer.userInfo == null && issuer.port == -1 && issuer.query == null && issuer.fragment == null)
                require(issuer.path.startsWith("/${savedRegion}_"))
                val savedClient = payload.getString("client_id")
                require(savedClient.matches(Regex("[a-zA-Z0-9]{1,128}")))
                CognitoConfiguration(savedClient, savedRegion)
            }.getOrNull()
            return recovered ?: CognitoConfiguration("", region.ifBlank { "us-east-1" })
        }
    }
}
