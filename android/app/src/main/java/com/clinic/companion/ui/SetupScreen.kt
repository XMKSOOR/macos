package com.clinic.companion.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
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
import androidx.compose.foundation.text.KeyboardOptions
import com.clinic.companion.data.ClinicRepo
import com.clinic.companion.data.Prefs
import kotlinx.coroutines.launch

@Composable
fun SetupScreen(
  initialUrl: String,
  initialKey: String,
  prefs: Prefs,
  repo: ClinicRepo,
  onDone: () -> Unit
) {
  var url by remember { mutableStateOf(initialUrl) }
  var key by remember { mutableStateOf(initialKey) }
  var busy by remember { mutableStateOf(false) }
  var message by remember { mutableStateOf<String?>(null) }
  var error by remember { mutableStateOf(false) }
  val scope = rememberCoroutineScope()

  fun persist() {
    prefs.setBaseUrl(url)
    prefs.setAnonKey(key)
  }

  Scaffold { pad ->
    Column(
      Modifier
        .fillMaxSize()
        .padding(pad)
        .padding(24.dp)
        .verticalScroll(rememberScrollState()),
      verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
      Text("إعداد الاتصال", style = MaterialTheme.typography.headlineSmall)
      Text(
        "أدخل عنوان مشروع Supabase والمفتاح العام (anon / publishable key). يجب أن يكون تطبيق السطح المكتب قد رفع البيانات مسبقاً.",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant
      )

      LabeledField(
        label = "Project URL",
        value = url,
        onValueChange = { url = it },
        singleLine = true
      )
      androidx.compose.material3.OutlinedTextField(
        value = key,
        onValueChange = { key = it },
        label = { Text("anon / publishable key") },
        singleLine = true,
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
        modifier = Modifier.fillMaxWidth()
      )

      if (message != null) {
        Text(
          message!!,
          color = if (error) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
          style = MaterialTheme.typography.bodyMedium
        )
      }

      Spacer(Modifier.height(4.dp))

      Button(
        onClick = {
          if (url.isBlank() || key.isBlank()) {
            error = true; message = "الحقول مطلوبة"; return@Button
          }
          persist()
          onDone()
        },
        modifier = Modifier.fillMaxWidth(),
        enabled = !busy
      ) { Text("حفظ ومتابعة") }

      OutlinedButton(
        onClick = {
          if (url.isBlank() || key.isBlank()) {
            error = true; message = "الحقول مطلوبة"; return@OutlinedButton
          }
          persist()
          busy = true; message = null
          scope.launch {
            try {
              repo.testConnection()
              error = false; message = "تم الاتصال بنجاح ✓"
            } catch (e: Exception) {
              error = true; message = e.message ?: "فشل الاتصال"
            } finally {
              busy = false
            }
          }
        },
        modifier = Modifier.fillMaxWidth(),
        enabled = !busy
      ) {
        if (busy) {
          CircularProgressIndicator(Modifier.height(18.dp).fillMaxWidth(0.1f))
        } else {
          Text("اختبار الاتصال (يتطلب تسجيل الدخول)")
        }
      }

      Text(
        "ملاحظة: اختيار «اختبار الاتصال» يحتاج جدول patients — تأكد من تنفيذ ملف supabase/schema.sql. يمكنك التخطي والمتابعة لتسجيل الدخول.",
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant
      )
    }
  }
}