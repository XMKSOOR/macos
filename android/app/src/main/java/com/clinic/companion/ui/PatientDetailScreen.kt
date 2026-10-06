package com.clinic.companion.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.clinic.companion.data.Appointment
import com.clinic.companion.data.ClinicRepo
import com.clinic.companion.data.Invoice
import com.clinic.companion.data.Patient
import com.clinic.companion.data.PatientMedication

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PatientDetailScreen(repo: ClinicRepo, patientId: Long, onBack: () -> Unit) {
  var loading by remember { mutableStateOf(true) }
  var error by remember { mutableStateOf<String?>(null) }
  var patient by remember { mutableStateOf<Patient?>(null) }
  var meds by remember { mutableStateOf<List<PatientMedication>>(emptyList()) }
  var appts by remember { mutableStateOf<List<Appointment>>(emptyList()) }
  var invoices by remember { mutableStateOf<List<Invoice>>(emptyList()) }
  var tab by remember { mutableIntStateOf(0) }
  val titles = listOf("معلومات", "الأدوية", "المواعيد", "الفواتير")

  LaunchedEffect(patientId) {
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
        title = { Text(patient?.name ?: "ملف المريض") },
        navigationIcon = {
          IconButton(onClick = onBack) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "رجوع")
          }
        }
      )
    }
  ) { pad ->
    Column(Modifier.fillMaxSize().padding(pad)) {
      if (loading) { LoadingBox(); return@Column }
      if (error != null) { ErrorPane(error!!); return@Column }
      val p = patient ?: run { EmptyBox("المريض غير موجود"); return@Column }

      TabRow(selectedTabIndex = tab) {
        titles.forEachIndexed { i, t ->
          Tab(selected = tab == i, onClick = { tab = i }, text = { Text(t) })
        }
      }

      Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
      ) {
        when (tab) {
          0 -> InfoTab(p)
          1 -> MedsTab(meds)
          2 -> ApptsTab(appts)
          3 -> InvoicesTab(invoices)
        }
      }
    }
  }
}

@Composable
private fun InfoRowBlock(label: String, value: String?) {
  if (value.isNullOrBlank()) return
  SectionCard {
    Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium)
    Text(value, fontWeight = FontWeight.Medium)
  }
}

@Composable
private fun InfoTab(p: Patient) {
  Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
    InfoRow("الهاتف", p.phone)
    InfoRow("الجنس", p.gender)
    InfoRow("تاريخ الميلاد", p.birthDate)
    InfoRow("الرقم الوطني", p.nationalId)
    InfoRow("العنوان", p.address)
    InfoRow("الحساسية", p.allergies)
    InfoRow("الأمراض المزمنة", p.chronicDiseases)
    InfoRow("الحالة الفسيولوجية", p.physiologicalStatus)
    InfoRow("ملاحظات طبية", p.medicalNotes)
    InfoRow("ملاحظات", p.notes)
  }
}

@Composable
private fun MedsTab(meds: List<PatientMedication>) {
  if (meds.isEmpty()) { EmptyBox("لا توجد أدوية مسجّلة"); return }
  meds.forEach { m ->
    SectionCard {
      Text(
        (m.tradeName.ifBlank { m.scientificName }).ifBlank { "دواء" },
        fontWeight = FontWeight.SemiBold
      )
      if (m.scientificName.isNotBlank() && m.tradeName.isNotBlank()) {
        Text(m.scientificName, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
      }
      val line = listOf(m.dose, m.frequency, m.form).filter { it.isNotBlank() }.joinToString(" • ")
      if (line.isNotBlank()) Text(line)
      if (m.prescriber.isNotBlank()) Text("الطبيب: ${m.prescriber}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
      Text(if (m.active == 1) "نشط" else "متوقف", color = if (m.active == 1) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
    }
  }
}

@Composable
private fun ApptsTab(appts: List<Appointment>) {
  if (appts.isEmpty()) { EmptyBox("لا توجد مواعيد"); return }
  appts.forEach { a ->
    SectionCard {
      Text("${a.date}  ${a.time}".trim(), fontWeight = FontWeight.SemiBold)
      if (a.reason.isNotBlank()) Text(a.reason)
      Text(statusLabel(a.status), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
    }
  }
}

@Composable
private fun InvoicesTab(invoices: List<Invoice>) {
  if (invoices.isEmpty()) { EmptyBox("لا توجد فواتير"); return }
  invoices.forEach { inv ->
    SectionCard {
      Text("فاتورة ${inv.invoiceNo}", fontWeight = FontWeight.SemiBold)
      Text("التاريخ: ${inv.date}", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
      Text("الإجمالي: ${formatMoney(inv.total)}  •  المدفوع: ${formatMoney(inv.paid)}")
      Text(statusLabel(inv.status), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
    }
  }
}

fun statusLabel(status: String): String = when (status) {
  "paid" -> "مدفوعة"
  "partial" -> "مدفوعة جزئياً"
  "unpaid" -> "غير مدفوعة"
  "scheduled" -> "مجدول"
  "done", "completed" -> "مكتمل"
  "cancelled" -> "ملغى"
  else -> status
}