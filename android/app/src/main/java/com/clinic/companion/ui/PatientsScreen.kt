package com.clinic.companion.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.clinic.companion.data.ClinicRepo
import com.clinic.companion.data.Patient
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PatientsScreen(repo: ClinicRepo) {
  var query by remember { mutableStateOf("") }
  var loading by remember { mutableStateOf(true) }
  var error by remember { mutableStateOf<String?>(null) }
  var list by remember { mutableStateOf<List<Patient>>(emptyList()) }
  var selected by remember { mutableStateOf<Patient?>(null) }
  var showAdd by remember { mutableStateOf(false) }
  var reloadKey by remember { mutableStateOf(0) }
  val scope = rememberCoroutineScope()

  LaunchedEffect(query, reloadKey) {
    loading = true; error = null
    try {
      list = repo.listPatients(query)
    } catch (e: Exception) {
      error = e.message
    } finally {
      loading = false
    }
  }

  if (selected != null) {
    PatientDetailScreen(
      repo = repo,
      patientId = selected!!.id,
      onBack = { selected = null; reloadKey++ }
    )
    return
  }

  Scaffold(
    topBar = { TopAppBar(title = { Text("المرضى (${list.size})") }) },
    floatingActionButton = {
      FloatingActionButton(onClick = { showAdd = true }) {
        Icon(Icons.Filled.Add, contentDescription = "إضافة مريض")
      }
    }
  ) { pad ->
    Column(Modifier.fillMaxSize().padding(pad)) {
      OutlinedTextField(
        value = query,
        onValueChange = { query = it },
        label = { Text("بحث بالاسم أو الهاتف") },
        leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
        singleLine = true,
        modifier = Modifier.fillMaxWidth().padding(12.dp)
      )

      when {
        loading -> LoadingBox()
        error != null -> ErrorPane(error!!) { reloadKey++ }
        list.isEmpty() -> EmptyBox("لا يوجد مرضى")
        else -> LazyColumn(
          Modifier.fillMaxSize(),
          contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp),
          verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
          items(list, key = { it.id }) { p ->
            SectionCard(Modifier.clickable { selected = p }) {
              Text(p.name, fontWeight = FontWeight.SemiBold)
              if (p.phone.isNotBlank()) Text("📞 ${p.phone}", color = MaterialTheme.colorScheme.onSurfaceVariant)
              val sub = buildString {
                if (p.gender.isNotBlank()) append(if (p.gender == "male") "ذكر" else if (p.gender == "female") "أنثى" else p.gender)
                if (p.birthDate.isNotBlank()) { if (isNotEmpty()) append(" • "); append(p.birthDate) }
              }
              if (sub.isNotBlank()) Text(sub, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
              if (p.allergies.isNotBlank()) Text("⚠ حساسية: ${p.allergies}", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
          }
        }
      }
    }
  }

  if (showAdd) {
    AddPatientDialog(
      onDismiss = { showAdd = false },
      onSave = { body ->
        scope.launch {
          try {
            repo.addPatient(body)
            showAdd = false
            reloadKey++
          } catch (e: Exception) {
            error = e.message
          }
        }
      }
    )
  }
}

@Composable
private fun AddPatientDialog(onDismiss: () -> Unit, onSave: (Map<String, Any?>) -> Unit) {
  var name by remember { mutableStateOf("") }
  var phone by remember { mutableStateOf("") }
  var gender by remember { mutableStateOf("") }
  var birth by remember { mutableStateOf("") }
  var nationalId by remember { mutableStateOf("") }
  var address by remember { mutableStateOf("") }
  var allergies by remember { mutableStateOf("") }
  var chronic by remember { mutableStateOf("") }
  var notes by remember { mutableStateOf("") }

  AlertDialog(
    onDismissRequest = onDismiss,
    title = { Text("مريض جديد") },
    text = {
      Column(
        Modifier.fillMaxWidth().verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(8.dp)
      ) {
        LabeledField("الاسم *", name) { name = it }
        LabeledField("الهاتف", phone) { phone = it }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          LabeledField("الجنس", gender, Modifier.weight(1f)) { gender = it }
          LabeledField("تاريخ الميلاد", birth, Modifier.weight(1f)) { birth = it }
        }
        LabeledField("الرقم الوطني", nationalId) { nationalId = it }
        LabeledField("العنوان", address) { address = it }
        LabeledField("الحساسية", allergies) { allergies = it }
        LabeledField("الأمراض المزمنة", chronic) { chronic = it }
        LabeledField("ملاحظات", notes, singleLine = false, minLines = 2) { notes = it }
      }
    },
    confirmButton = {
      TextButton(onClick = {
        if (name.isBlank()) return@TextButton
        onSave(
          mapOf(
            "name" to name.trim(),
            "phone" to phone.trim(),
            "gender" to gender.trim(),
            "birth_date" to birth.trim(),
            "national_id" to nationalId.trim(),
            "address" to address.trim(),
            "allergies" to allergies.trim(),
            "chronic_diseases" to chronic.trim(),
            "medical_notes" to notes.trim()
          )
        )
      }) { Text("حفظ") }
    },
    dismissButton = { TextButton(onClick = onDismiss) { Text("إلغاء") } }
  )
}