package com.clinic.companion.ui

import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.clinic.companion.data.ClinicRepo
import com.clinic.companion.data.Invoice
import com.clinic.companion.data.InvoiceItem
import com.clinic.companion.data.Patient

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InvoicesScreen(repo: ClinicRepo) {
  var loading by remember { mutableStateOf(true) }
  var error by remember { mutableStateOf<String?>(null) }
  var invoices by remember { mutableStateOf<List<Invoice>>(emptyList()) }
  var patients by remember { mutableStateOf<List<Patient>>(emptyList()) }
  var selected by remember { mutableStateOf<Invoice?>(null) }

  LaunchedEffect(Unit) {
    loading = true; error = null
    try {
      invoices = repo.invoices()
      patients = repo.listPatients("")
    } catch (e: Exception) {
      error = e.message
    } finally {
      loading = false
    }
  }

  if (selected != null) {
    InvoiceDetailScreen(repo, selected!!, onBack = { selected = null })
    return
  }

  Scaffold(topBar = { TopAppBar(title = { Text("الفواتير (${invoices.size})") }) }) { pad ->
    Box(Modifier.fillMaxSize().padding(pad)) {
      when {
        loading -> LoadingBox()
        error != null -> ErrorPane(error!!)
        invoices.isEmpty() -> EmptyBox("لا توجد فواتير")
        else -> LazyColumn(
          Modifier.fillMaxSize(),
          contentPadding = PaddingValues(12.dp),
          verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
          items(invoices, key = { it.id }) { inv ->
            val name = patients.firstOrNull { it.id == inv.patientId }?.name ?: "مريض #${inv.patientId}"
            SectionCard(Modifier.clickable { selected = inv }) {
              Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("فاتورة ${inv.invoiceNo}", fontWeight = FontWeight.SemiBold)
                Text(formatMoney(inv.total), color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
              }
              Text(name, color = MaterialTheme.colorScheme.onSurfaceVariant)
              Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(inv.date, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(statusLabel(inv.status), style = MaterialTheme.typography.bodySmall)
              }
            }
          }
        }
      }
    }
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun InvoiceDetailScreen(repo: ClinicRepo, invoice: Invoice, onBack: () -> Unit) {
  var items by remember { mutableStateOf<List<InvoiceItem>>(emptyList()) }
  var loading by remember { mutableStateOf(true) }
  var error by remember { mutableStateOf<String?>(null) }

  LaunchedEffect(invoice.id) {
    try {
      items = repo.invoiceItems(invoice.id)
    } catch (e: Exception) {
      error = e.message
    } finally {
      loading = false
    }
  }

  Scaffold(
    topBar = {
      TopAppBar(
        title = { Text("فاتورة ${invoice.invoiceNo}") },
        navigationIcon = {
          IconButton(onClick = onBack) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "رجوع")
          }
        }
      )
    }
  ) { pad ->
    Column(Modifier.fillMaxSize().padding(pad).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
      SectionCard {
        InfoRow("التاريخ", invoice.date)
        InfoRow("الحالة", statusLabel(invoice.status))
        InfoRow("الإجمالي", formatMoney(invoice.total))
        InfoRow("الخصم", formatMoney(invoice.discount))
        InfoRow("المدفوع", formatMoney(invoice.paid))
        InfoRow("المتبقي", formatMoney(invoice.total - invoice.paid))
        InfoRow("أنشأها", invoice.createdBy)
      }

      Text("البنود", style = MaterialTheme.typography.titleMedium)
      when {
        loading -> LoadingBox()
        error != null -> Text(error!!, color = MaterialTheme.colorScheme.error)
        items.isEmpty() -> Text("لا توجد بنود", color = MaterialTheme.colorScheme.onSurfaceVariant)
        else -> items.forEach { it2 ->
          SectionCard {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
              Text("${it2.name} × ${it2.qty}", fontWeight = FontWeight.Medium)
              Text(formatMoney(it2.cost * it2.qty))
            }
          }
        }
      }

      if (invoice.notes.isNotBlank()) {
        SectionCard { Text("ملاحظات: ${invoice.notes}") }
      }
    }
  }
}