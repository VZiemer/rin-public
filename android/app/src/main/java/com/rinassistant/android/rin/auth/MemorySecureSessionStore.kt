package com.rinassistant.android.rin.auth

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class KeystoreSecureSessionStore(
    context: Context,
) : SecureSessionStore {
    private val prefs: SharedPreferences = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    override fun save(session: AuthSession) {
        val payload = JSONObject()
            .put("accessToken", session.accessToken)
            .put("refreshToken", session.refreshToken)
            .put("idToken", session.idToken)
            .put("expiresAtEpochMs", session.expiresAtEpochMs)
            .toString()
        prefs.edit().putString(KEY, encrypt(payload)).apply()
    }

    override fun read(): AuthSession? {
        val packed = prefs.getString(KEY, null) ?: return null
        return runCatching {
            val json = JSONObject(decrypt(packed))
            AuthSession(
                accessToken = json.getString("accessToken"),
                refreshToken = json.getString("refreshToken"),
                idToken = json.optString("idToken"),
                expiresAtEpochMs = json.getLong("expiresAtEpochMs"),
            )
        }.getOrNull()
    }

    override fun clear() {
        prefs.edit().remove(KEY).apply()
    }

    private fun encrypt(value: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val encrypted = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(cipher.iv + encrypted, Base64.NO_WRAP)
    }

    private fun decrypt(value: String): String {
        val packed = Base64.decode(value, Base64.NO_WRAP)
        val iv = packed.copyOfRange(0, 12)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, iv))
        return String(cipher.doFinal(packed.copyOfRange(12, packed.size)), Charsets.UTF_8)
    }

    private fun secretKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val existing = keyStore.getKey(ALIAS, null) as? SecretKey
        if (existing != null) return existing
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    companion object {
        private const val PREFS = "rin_secure_auth"
        private const val KEY = "session"
        private const val ALIAS = "rin.auth.session"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}
