package com.rinassistant.android.rin.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import com.rinassistant.android.rin.ui.theme.RinOutlineButton as Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.rinassistant.android.R

enum class AuthMode { SIGN_IN, SIGN_UP, CONFIRM }

@Composable
fun AuthScreen(
    mode: AuthMode,
    onModeChange: (AuthMode) -> Unit,
    email: String,
    password: String,
    code: String,
    onEmailChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onCodeChange: (String) -> Unit,
    loading: Boolean,
    error: String?,
    onSignIn: () -> Unit,
    onSignUp: () -> Unit,
    onConfirm: () -> Unit,
) {
    Surface(Modifier.fillMaxSize()) {
        Column(
            Modifier.safeDrawingPadding().padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = stringResource(
                    when (mode) {
                        AuthMode.SIGN_IN -> R.string.auth_title
                        AuthMode.SIGN_UP -> R.string.auth_title_sign_up
                        AuthMode.CONFIRM -> R.string.auth_title_confirm
                    },
                ),
                style = MaterialTheme.typography.headlineMedium,
            )
            OutlinedTextField(email, onEmailChange, label = { Text(stringResource(R.string.auth_email)) }, modifier = Modifier.fillMaxWidth())
            if (mode != AuthMode.CONFIRM) {
                OutlinedTextField(
                    password,
                    onPasswordChange,
                    label = { Text(stringResource(R.string.auth_password)) },
                    visualTransformation = PasswordVisualTransformation(),
                    modifier = Modifier.fillMaxWidth(),
                )
            } else {
                OutlinedTextField(code, onCodeChange, label = { Text(stringResource(R.string.auth_code)) }, modifier = Modifier.fillMaxWidth())
            }
            if (error != null) Text(error, color = MaterialTheme.colorScheme.error)
            if (loading) CircularProgressIndicator()
            else when (mode) {
                AuthMode.SIGN_IN -> Button(onClick = onSignIn, modifier = Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.auth_sign_in))
                }
                AuthMode.SIGN_UP -> Button(onClick = onSignUp, modifier = Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.auth_sign_up))
                }
                AuthMode.CONFIRM -> Button(onClick = onConfirm, modifier = Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.auth_confirm))
                }
            }
            if (mode == AuthMode.SIGN_IN) {
                TextButton(onClick = { onModeChange(AuthMode.SIGN_UP) }) {
                    Text(stringResource(R.string.auth_go_sign_up))
                }
            } else {
                TextButton(onClick = { onModeChange(AuthMode.SIGN_IN) }) {
                    Text(stringResource(R.string.auth_go_sign_in))
                }
            }
            if (mode != AuthMode.CONFIRM) {
                TextButton(onClick = { onModeChange(AuthMode.CONFIRM) }) { Text(stringResource(R.string.auth_have_code)) }
            }
        }
    }
}
