package com.rinassistant.android.rin.auth

import java.util.Base64
import org.junit.Assert.*
import org.junit.Test

class CognitoConfigurationTest {
    private fun session(issuer: String = "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_pool"): AuthSession {
        val payload = """{"iss":"$issuer","client_id":"existingclient123"}"""
        val encoded = Base64.getUrlEncoder().withoutPadding().encodeToString(payload.toByteArray())
        return AuthSession("header.$encoded.signature", "refresh", "id", 0)
    }
    @Test fun `update without environment retains configuration of saved user even after token expiry`() {
        assertEquals(CognitoConfiguration("existingclient123", "us-east-1"), CognitoConfiguration.resolve("", "", session()))
    }
    @Test fun `explicit build configuration takes precedence`() {
        assertEquals(CognitoConfiguration("configured", "eu-west-1"), CognitoConfiguration.resolve("configured", "eu-west-1", session()))
    }
    @Test fun `missing or corrupt session does not invent authentication`() {
        assertEquals("", CognitoConfiguration.resolve("", "", null).clientId)
        assertEquals("", CognitoConfiguration.resolve("", "", session().copy(accessToken = "invalid")).clientId)
    }
    @Test fun `non Cognito issuers cannot redirect refresh requests`() {
        listOf("https://evil.example/us-east-1_pool", "http://cognito-idp.us-east-1.amazonaws.com/us-east-1_pool",
            "https://cognito-idp.us-east-1.amazonaws.com.evil.example/us-east-1_pool").forEach {
            assertEquals("", CognitoConfiguration.resolve("", "", session(it)).clientId)
        }
    }
}
