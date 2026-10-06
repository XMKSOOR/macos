package com.clinic.companion.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.clinic.companion.data.ClinicRepo
import kotlinx.coroutines.launch

@Composable
fun LoginScreen(
  defaultEmail: String,
  repo: ClinicRepo,
  onLoggedIn: () -> Unit,
  onChangeServer: () -> Unit
) {
  var email by remember { mutableStateOf(defaultEmail) }
  var password by remember { mutableStateOf("") }
  var busy by remember { mutableStateOf(false) }
  var error by remember { mutableStateOf<String?>(null) }
  val scope = rememberCoroutineScope()

  Scaffold { pad ->
    Column(
      Modifier
        .fillMaxSize()
        .padding(pad)
        .padding(24.dp)
        .verticalScroll(rememberScrollState()),
      verticalArrangement = Arrangement.spacedBy(14.dp),
      horizontalAlignment = Alignment.CenterHorizontally
    ) {
      Spacer(Modifier.height(40.dp))
      Text("عيادة الأسنان", style = MaterialTheme.typography.headlineMedium)
      Text("تطبيق المرافق — تسجيل الدخول", color = MaterialTheme.colorScheme.onSurfaceVariant)
      Spacer(Modifier.height(16.dp))

      OutlinedTextField(
        value = email,
        onValueChange = { email = it },
        label = { Text("البريد الإلكتروني") },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
        modifier = Modifier.fillMaxWidth()
      )
      OutlinedTextField(
        value = password,
        onValueChange = { password = it },
        label = { Text("كلمة المرور") },
        singleLine = true,
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
        modifier = Modifier.fillMaxWidth()
      )

      if (error != null) {
        Text(error!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
      }

      Button(
        onClick = {
          if (email.isBlank() || password.isBlank()) {
            error = "أدخل البريد وكلمة المرور"; return@Button
          }
          busy = true; error = null
          scope.launch {
            try {
              repo.login(email.trim(), password)
              onLoggedIn()
            } catch (e: Exception) {
              error = e.message ?: "فشل تسجيل الدخول"
            } finally {
              busy = false
            }
          }
        },
        modifier = Modifier.fillMaxWidth(),
        enabled = !busy
      ) { Text(if (busy) "جارٍ الدخول..." else "تسجيل الدخول") }

      TextButton(onClick = onChangeServer) { Text("تغيير إعدادات الخادم") }
    }
  }
}