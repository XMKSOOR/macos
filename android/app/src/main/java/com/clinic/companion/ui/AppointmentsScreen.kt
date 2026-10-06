package com.clinic.companion.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.clinic.companion.data.Appointment
import com.clinic.companion.data.ClinicRepo
import com.clinic.companion.data.Patient
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppointmentsScreen(repo: ClinicRepo) {
  var loading by remember { mutableStateOf(true) }
  var error by remember { mutableStateOf<String?>(null) }
  var appts by remember { mutableStateOf<List<Appointment>>(emptyList()) }
  var patients by remember { mutableStateOf<List<Patient>>(emptyList()) }
  var showAll by remember { mutableStateOf(false) }
  var showAdd by remember { mutableStateOf(false) }
  var reloadKey by remember { mutableStateOf(0) }
  val scope = rememberCoroutineScope()

  LaunchedEffect(showAll, reloadKey) {
    loading = true; error = null
    try {
      appts = if (showAll) repo.appointments() else repo.upcoming(today())
      if (patients.isEmpty()) patients = repo.listPatients("")
    } catch (e: Exception) {
      error = e.message
    } finally {
      loading = false
    }
  }

  Scaffold(
    topBar = {
      TopAppBar(
        title = { Text("المواعيد") },
        actions = {
          Row(
            verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
            modifier = Modifier.padding(end = 8.dp)
          ) {
            Text(if (showAll) "الكل" else "القادمة")
            Switch(checked = showAll, onCheckedChange = { showAll = it })
          }
        }
      )
    },
    floatingActionButton = {
      FloatingActionButton(onClick = { showAdd = true }) {
        Icon(Icons.Filled.Add, contentDescription = "إضافة موعد")
      }
    }
  ) { pad ->
    Box(Modifier.fillMaxSize().padding(pad)) {
      when {
        loading -> LoadingBox()
        error != null -> ErrorPane(error!!) { reloadKey++ }
        appts.isEmpty() -> EmptyBox("لا توجد مواعيد")
        else -> LazyColumn(
          Modifier.fillMaxSize(),
          contentPadding = PaddingValues(12.dp),
          verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
          items(appts, key = { it.id }) { a ->
            val name = patients.firstOrNull { it.id == a.patientId }?.name ?: "مريض #${a.patientId}"
            SectionCard {
              Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(name, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold)
                Text("${a.date} ${a.time}".trim(), color = MaterialTheme.colorScheme.primary)
              }
              if (a.reason.isNotBlank()) Text(a.reason)
              Text(
                statusLabel(a.status),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodySmall
              )
            }
          }
        }
      }
    }
  }

  if (showAdd) {
    AddAppointmentDialog(
      patients = patients,
      onDismiss = { showAdd = false },
      onSave = { body ->
        scope.launch {
          try {
            repo.addAppointment(body)
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
private fun AddAppointmentDialog(
  patients: List<Patient>,
  onDismiss: () -> Unit,
  onSave: (Map<String, Any?>) -> Unit
) {
  var patientId by remember { mutableStateOf<Long?>(null) }
  var menuOpen by remember { mutableStateOf(false) }
  var date by remember { mutableStateOf(today()) }
  var time by remember { mutableStateOf("") }
  var reason by remember { mutableStateOf("") }

  val selectedName = patients.firstOrNull { it.id == patientId }?.name ?: "اختر المريض"

  AlertDialog(
    onDismissRequest = onDismiss,
    title = { Text("موعد جديد") },
    text = {
      Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Box {
          OutlinedButton(onClick = { menuOpen = true }, modifier = Modifier.fillMaxWidth()) {
            Text(selectedName)
          }
          DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
            patients.take(50).forEach { p ->
              DropdownMenuItem(
                text = { Text(p.name) },
                onClick = { patientId = p.id; menuOpen = false }
              )
            }
          }
        }
        LabeledField("التاريخ (YYYY-MM-DD)", date, { date = it })
        LabeledField("الوقت (HH:MM)", time, { time = it })
        LabeledField("السبب", reason, { reason = it })
      }
    },
    confirmButton = {
      TextButton(onClick = {
        val pid = patientId ?: return@TextButton
        if (date.isBlank()) return@TextButton
        onSave(
          mapOf(
            "patient_id" to pid,
            "date" to date.trim(),
            "time" to time.trim(),
            "reason" to reason.trim(),
            "status" to "scheduled"
          )
        )
      }) { Text("حفظ") }
    },
    dismissButton = { TextButton(onClick = onDismiss) { Text("إلغاء") } }
  )
}