package com.rinassistant.android.rin.auth

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AuthRepositoryTest {
    @Test
    fun signsInWithoutExposingCognitoTypesAndClearsSecretsOnLogout() = runBlocking {
        val store = InMemorySecureSessionStore()
        val auth = InMemoryAuthRepository(store, mutableMapOf("a@b.c" to "secret"))
        val session = auth.signIn("a@b.c", "secret")
        assertTrue(session.accessToken.startsWith("access-"))
        assertEquals(session.accessToken, store.read()?.accessToken)
        auth.signOut()
        assertNull(store.read())
        assertNull(auth.getSession())
    }

    @Test
    fun signUpRequiresConfirmationBeforeSignIn() = runBlocking {
        val auth = InMemoryAuthRepository()
        auth.signUp("new@b.c", "secret1")
        try {
            auth.signIn("new@b.c", "secret1")
            org.junit.Assert.fail("expected not confirmed")
        } catch (_: AuthError.NotConfirmed) {
        }
        auth.confirmSignUp("new@b.c", "123456")
        assertEquals("access-new@b.c", auth.signIn("new@b.c", "secret1").accessToken)
    }
}
