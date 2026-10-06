package com.clinic.companion.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
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

@Composable
fun DashboardScreen(repo: ClinicRepo) {
  var loading by remember { mutableStateOf(true) }
  var error by remember { mutableStateOf<String?>(null) }
  var patients by remember { mutableStateOf<List<Patient>>(emptyList()) }
  var upcoming by remember { mutableStateOf<List<Appointment>>(emptyList()) }
  var invoices by remember { mutableStateOf<List<Invoice>>(emptyList()) }

  LaunchedEffect(Unit) {
    loading = true; error = null
    try {
      patients = repo.listPatients("")
      upcoming = repo.upcoming(today())
      invoices = repo.invoices()
    } catch (e: Exception) {
      error = e.message
    } finally {
      loading = false
    }
  }

  if (loading) { LoadingBox(); return }
  if (error != null) { ErrorPane(error!!); return }

  val todayStr = today()
  val todayCount = upcoming.count { it.date == todayStr }
  val due = invoices.filter { it.status != "paid" }.sumOf { (it.total - it.paid).coerceAtLeast(0L) }

  Column(
    Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
    verticalArrangement = Arrangement.spacedBy(12.dp)
  ) {
    Text("لوحة الملخص", style = MaterialTheme.typography.headlineSmall)

    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
      StatCard("المرضى", patients.size.toString(), Modifier.weight(1f))
      StatCard("مواعيد اليوم", todayCount.toString(), Modifier.weight(1f))
    }
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
      StatCard("مواعيد قادمة", upcoming.count { it.date >= todayStr }.toString(), Modifier.weight(1f))
      StatCard("مبالغ مستحقة", formatMoney(due), Modifier.weight(1f))
    }

    Text("أقرب المواعيد", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp))
    val next = upcoming.filter { it.date >= todayStr }.take(6)
    if (next.isEmpty()) {
      Text("لا توجد مواعيد قادمة", color = MaterialTheme.colorScheme.onSurfaceVariant)
    } else {
      next.forEach { a ->
        val name = patients.firstOrNull { it.id == a.patientId }?.name ?: "مريض #${a.patientId}"
        SectionCard {
          Text(name, fontWeight = FontWeight.SemiBold)
          Text("${a.date}  ${a.time}".trim(), color = MaterialTheme.colorScheme.onSurfaceVariant)
          if (a.reason.isNotBlank()) Text(a.reason)
        }
      }
    }
  }
}

@Composable
private fun StatCard(label: String, value: String, modifier: Modifier = Modifier) {
  SectionCard(modifier) {
    Text(value, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
    Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant)
  }
}