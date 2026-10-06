package com.clinic.companion.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.clinic.companion.data.Appointment
import com.clinic.companion.data.ClinicRepo
import com.clinic.companion.data.Invoice
import com.clinic.companion.data.Patient
import com.clinic.companion.data.PatientMedication
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PatientDetailScreen(repo: ClinicRepo, patientId: Long, onBack: () -> Unit) {
  var loading by remember { mutableStateOf(true) }
  var error by remember { mutableStateOf<String?>(null) }
  var patient by remember { mutableStateOf<Patient?>(null) }
  var meds by remember { mutableStateOf<List<PatientMedication>>(emptyList()) }
  var appts by remember { mutableStateOf<List<Appointment>>(emptyList()) }
  var invoices by remember { mutableStateOf<List<Invoice>>(emptyList()) }
  var tab by remember { mutableStateOf(0) }
  var showAddMed by remember { mutableStateOf(false) }
  var reloadKey by remember { mutableStateOf(0) }
  val scope = rememberCoroutineScope()

  LaunchedEffect(reloadKey) {
    loading = true; error = null
    try {
      patient = repo.getPatient(patientId)
      meds = repo.patientMedications(patientId)
      appts = repo.patientAppointments(patientId)
      invoices = repo.patientInvoices(patientId)
    } catch (e: Exception) {
      error = e.message
    } finally {
      loading = false
    }
  }

  Scaffold(
    topBar = {
      TopAppBar(
        title = { Text(patient?.name ?: "مريض #$patientId") },
        navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "رجوع") } }
      )
    },
    floatingActionButton = {
      if (tab == 1) {
        FloatingActionButton(onClick = { showAddMed = true }) {
          Icon(Icons.Filled.Add, contentDescription = "إضافة دواء")
        }
      }
    }
  ) { pad ->
    Column(Modifier.fillMaxSize().padding(pad)) {
      Box(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
          listOf("بيانات", "الوصفات", "المواعيد", "الفواتير").forEachIndexed { i, label ->
            TextButton(onClick = { tab = i }) {
              Text(
                label,
                color = if (tab == i) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
              )
            }
          }
        }
      }

      when {
        loading -> LoadingBox()
        error != null -> ErrorPane(error!!)
        else -> Column(
          Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp),
          verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
          when (tab) {
            0 -> PatientInfoTab(patient)
            1 -> MedsTab(meds, onDelete = { m ->
              scope.launch {
                try { repo.deletePatientMedication(m.id); reloadKey++ }
                catch (e: Exception) { error = e.message }
              }
            })
            2 -> ApptsTab(appts)
            else -> InvoicesTab(invoices)
          }
        }
      }
    }
  }

  if (showAddMed) {
    AddMedicationDialog(
      onDismiss = { showAddMed = false },
      onSave = { values ->
        scope.launch {
          try {
            repo.addPatientMedication(values + ("patient_id" to patientId))
            showAddMed = false; reloadKey++
          } catch (e: Exception) {
            error = e.message; showAddMed = false
          }
        }
      }
    )
  }
}

@Composable
private fun PatientInfoTab(patient: Patient?) {
  if (patient == null) {
    EmptyBox("لم يتم العثور على المريض")
    return
  }
  SectionCard {
    InfoRow("الاسم", patient.name)
    InfoRow("الهاتف", patient.phone)
    InfoRow("تاريخ الميلاد", patient.birthDate)
    InfoRow("الجنس", patient.gender)
    InfoRow("العنوان", patient.address)
    InfoRow("الرقم الوطني", patient.nationalId)
    InfoRow("فصيلة/حساسية", patient.allergies)
    InfoRow("أمراض مزمنة", patient.chronicDiseases)
    InfoRow("ملاحظات طبية", patient.medicalNotes)
    InfoRow("ملاحظات", patient.notes)
  }
}

@Composable
private fun MedsTab(meds: List<PatientMedication>, onDelete: (PatientMedication) -> Unit) {
  if (meds.isEmpty()) { EmptyBox("لا توجد وصفات"); return }
  meds.forEach { m ->
    SectionCard {
      Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(m.tradeName.ifBlank { m.scientificName }, fontWeight = FontWeight.SemiBold)
        TextButton(onClick = { onDelete(m) }) { Text("حذف", color = MaterialTheme.colorScheme.error) }
      }
      if (m.scientificName.isNotBlank()) Text(m.scientificName, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
      val parts = listOf(m.dose, m.form, m.route, m.frequency).filter { it.isNotBlank() }
      if (parts.isNotEmpty()) Text(parts.joinToString(" • "))
      if (m.prescriber.isNotBlank()) Text("الطبيب: ${m.prescriber}", style = MaterialTheme.typography.bodySmall)
      if (m.startDate.isNotBlank()) Text("من ${m.startDate}" + if (m.endDate.isNotBlank()) " إلى ${m.endDate}" else "", style = MaterialTheme.typography.bodySmall)
      if (m.notes.isNotBlank()) Text(m.notes, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
  }
}

@Composable
private fun ApptsTab(appts: List<Appointment>) {
  if (appts.isEmpty()) { EmptyBox("لا توجد مواعيد"); return }
  appts.forEach { a ->
    SectionCard {
      Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text("${a.date} ${a.time}".trim(), fontWeight = FontWeight.SemiBold)
        Text(statusLabel(a.status), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall)
      }
      if (a.reason.isNotBlank()) Text(a.reason)
      if (a.notes.isNotBlank()) Text(a.notes, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
  }
}

@Composable
private fun InvoicesTab(invoices: List<Invoice>) {
  if (invoices.isEmpty()) { EmptyBox("لا توجد فواتير"); return }
  invoices.forEach { inv ->
    SectionCard {
      Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text("فاتورة ${inv.invoiceNo}", fontWeight = FontWeight.SemiBold)
        Text(formatMoney(inv.total), color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
      }
      InfoRow("التاريخ", inv.date)
      InfoRow("المدفوع", formatMoney(inv.paid))
      InfoRow("المتبقي", formatMoney(inv.total - inv.paid))
      InfoRow("الحالة", statusLabel(inv.status))
    }
  }
}

@Composable
private fun AddMedicationDialog(
  onDismiss: () -> Unit,
  onSave: (Map<String, Any?>) -> Unit
) {
  var trade by remember { mutableStateOf("") }
  var scientific by remember { mutableStateOf("") }
  var dose by remember { mutableStateOf("") }
  var form by remember { mutableStateOf("") }
  var route by remember { mutableStateOf("") }
  var frequency by remember { mutableStateOf("") }
  var prescriber by remember { mutableStateOf("") }
  var startDate by remember { mutableStateOf(today()) }
  var endDate by remember { mutableStateOf("") }
  var notes by remember { mutableStateOf("") }
  var active by remember { mutableStateOf(true) }
  var busy by remember { mutableStateOf(false) }

  AlertDialog(
    onDismissRequest = { if (!busy) onDismiss() },
    title = { Text("إضافة وصفة") },
    text = {
      Column(
        Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(8.dp)
      ) {
        LabeledField("الاسم التجاري", trade) { trade = it }
        LabeledField("الاسم العلمي", scientific) { scientific = it }
        LabeledField("الجرعة", dose) { dose = it }
        LabeledField("الشكل الدوائي", form) { form = it }
        LabeledField("طريقة الإعطاء", route) { route = it }
        LabeledField("التكرار", frequency) { frequency = it }
        LabeledField("الطبيب المعالج", prescriber) { prescriber = it }
        LabeledField("تاريخ البدء", startDate) { startDate = it }
        LabeledField("تاريخ الانتهاء", endDate) { endDate = it }
        LabeledField("ملاحظات", notes, singleLine = false, minLines = 2) { notes = it }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
          Text("نشطة", fontWeight = FontWeight.Medium)
          Switch(checked = active, onCheckedChange = { active = it })
        }
      }
    },
    confirmButton = {
      TextButton(
        enabled = !busy && (trade.isNotBlank() || scientific.isNotBlank()),
        onClick = {
          busy = true
          onSave(
            mapOf(
              "trade_name" to trade.trim(),
              "scientific_name" to scientific.trim(),
              "dose" to dose.trim(),
              "form" to form.trim(),
              "route" to route.trim(),
              "frequency" to frequency.trim(),
              "prescriber" to prescriber.trim(),
              "start_date" to startDate.trim(),
              "end_date" to endDate.trim(),
              "notes" to notes.trim(),
              "active" to (if (active) 1 else 0),
              "category" to "prescription"
            )
          )
        }
      ) { Text("حفظ") }
    },
    dismissButton = { TextButton(onClick = onDismiss, enabled = !busy) { Text("إلغاء") } }
  )
}

fun statusLabel(status: String): String = when (status) {
  "paid" -> "مدفوعة"
  "partial" -> "مدفوعة جزئياً"
  "unpaid" -> "غير مدفوعة"
  "scheduled" -> "مجدول"
  "completed" -> "مكتمل"
  "cancelled" -> "ملغى"
  else -> status
}