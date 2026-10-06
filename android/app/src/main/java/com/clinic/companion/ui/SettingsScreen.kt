package com.clinic.companion.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.clinic.companion.data.ClinicRepo
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
  repo: ClinicRepo,
  email: String,
  onLogout: () -> Unit,
  onReconfigure: () -> Unit
) {
  var message by remember { mutableStateOf<String?>(null) }
  var busy by remember { mutableStateOf(false) }
  val scope = rememberCoroutineScope()

  Scaffold(topBar = { TopAppBar(title = { Text("الإعدادات") }) }) { pad ->
    Column(
      Modifier.fillMaxSize().padding(pad).padding(16.dp).verticalScroll(rememberScrollState()),
      verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
      SectionCard {
        Text("الحساب", style = MaterialTheme.typography.titleMedium)
        InfoRow("البريد الإلكتروني", email.ifBlank { "—" })
      }

      OutlinedButton(
        onClick = {
          busy = true; message = null
          scope.launch {
            try {
              repo.testConnection()
              message = "الاتصال بالخادم يعمل ✓"
            } catch (e: Exception) {
              message = e.message ?: "فشل الاتصال"
            } finally {
              busy = false
            }
          }
        },
        enabled = !busy
      ) { Text("اختبار الاتصال بالخادم") }

      if (message != null) {
        Text(message!!, color = MaterialTheme.colorScheme.onSurfaceVariant)
      }

      OutlinedButton(onClick = onReconfigure) { Text("تغيير إعدادات الخادم") }

      Button(onClick = onLogout) { Text("تسجيل الخروج") }

      Text(
        "لعرض البيانات، يجب رفعها من تطبيق السطح المكتب إلى Supabase Postgres (الإعدادات ← تطبيق الجوال).",
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant
      )
    }
  }
}