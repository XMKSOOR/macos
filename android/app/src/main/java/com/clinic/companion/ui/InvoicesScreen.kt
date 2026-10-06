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
import com.clinic.companion.data.Invoice
import com.clinic.companion.data.InvoiceItem
import com.clinic.companion.data.Patient
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InvoicesScreen(repo: ClinicRepo, userName: String) {
  var loading by remember { mutableStateOf(true) }
  var error by remember { mutableStateOf<String?>(null) }
  var invoices by remember { mutableStateOf<List<Invoice>>(emptyList()) }
  var patients by remember { mutableStateOf<List<Patient>>(emptyList()) }
  var selected by remember { mutableStateOf<Invoice?>(null) }
  var showEditor by remember { mutableStateOf(false) }
  var reloadKey by remember { mutableStateOf(0) }

  LaunchedEffect(reloadKey) {
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

  if (showEditor) {
    InvoiceEditorScreen(
      repo = repo,
      userName = userName,
      onDone = { showEditor = false; reloadKey++ },
      onCancel = { showEditor = false }
    )
    return
  }

  if (selected != null) {
    InvoiceDetailScreen(
      repo = repo,
      invoice = selected!!,
      onBack = { selected = null },
      onChanged = { selected = null; reloadKey++ }
    )
    return
  }

  Scaffold(
    topBar = { TopAppBar(title = { Text("الفواتير (${invoices.size})") }) },
    floatingActionButton = {
      FloatingActionButton(onClick = { showEditor = true }) {
        Icon(Icons.Filled.Add, contentDescription = "فاتورة جديدة")
      }
    }
  ) { pad ->
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
            val name = inv.patientName
              ?: patients.firstOrNull { it.id == inv.patientId }?.name
              ?: "مريض #${inv.patientId}"
            SectionCard(Modifier.clickable { selected = inv }) {
              Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("فاتورة ${inv.invoiceNo}", fontWeight = FontWeight.SemiBold)
                Text(formatMoney(inv.total), color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
              }
              Text(name, color = MaterialTheme.colorScheme.onSurfaceVariant)
              Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(inv.date, style = MaterialTheme.typography.bodySmall)
                Text(statusLabel(inv.status), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
private fun InvoiceDetailScreen(
  repo: ClinicRepo,
  invoice: Invoice,
  onBack: () -> Unit,
  onChanged: () -> Unit
) {
  var loading by remember { mutableStateOf(true) }
  var error by remember { mutableStateOf<String?>(null) }
  var items by remember { mutableStateOf<List<InvoiceItem>>(emptyList()) }
  var showPay by remember { mutableStateOf(false) }
  var showDelete by remember { mutableStateOf(false) }
  var busy by remember { mutableStateOf(false) }
  var full by remember { mutableStateOf(invoice) }
  val scope = rememberCoroutineScope()

  LaunchedEffect(invoice.id) {
    try {
      repo.invoiceWithItems(invoice.id)?.let {
        full = it
        items = it.items
      }
    } catch (e: Exception) {
      error = e.message
    } finally {
      loading = false
    }
  }

  Scaffold(
    topBar = {
      TopAppBar(
        title = { Text("فاتورة ${full.invoiceNo}") },
        navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "رجوع") } },
        actions = { TextButton(onClick = { showDelete = true }) { Text("حذف", color = MaterialTheme.colorScheme.error) } }
      )
    }
  ) { pad ->
    Column(
      Modifier.fillMaxSize().padding(pad).verticalScroll(rememberScrollState()).padding(12.dp),
      verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
      SectionCard {
        InfoRow("المريض", full.patientName ?: "مريض #${full.patientId}")
        InfoRow("التاريخ", full.date)
        InfoRow("الحالة", statusLabel(full.status))
        InfoRow("المجموع الفرعي", formatMoney(full.subtotal))
        InfoRow("الخصم", formatMoney(full.discount))
        InfoRow("الإجمالي", formatMoney(full.total))
        InfoRow("المدفوع", formatMoney(full.paid))
        InfoRow("المتبقي", formatMoney(full.total - full.paid))
        InfoRow("أنشأها", full.createdBy)
      }

      if (full.total > full.paid) {
        TextButton(onClick = { showPay = true }, enabled = !busy) { Text("تسجيل دفعة") }
      }

      Text("البنود", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
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

      if (full.notes.isNotBlank()) {
        SectionCard { Text("ملاحظات: ${full.notes}") }
      }
    }
  }

  if (showPay) {
    var amount by remember { mutableStateOf(moneyInput(full.total - full.paid)) }
    AlertDialog(
      onDismissRequest = { if (!busy) showPay = false },
      title = { Text("تسجيل دفعة") },
      text = {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
          InfoRow("المتبقي", formatMoney(full.total - full.paid))
          LabeledField("المبلغ", amount) { amount = it }
        }
      },
      confirmButton = {
        TextButton(
          enabled = !busy,
          onClick = {
            busy = true
            scope.launch {
              try {
                repo.addPayment(full.id, parseMoney(amount))
                repo.invoiceWithItems(full.id)?.let { full = it; items = it.items }
                showPay = false
              } catch (e: Exception) {
                error = e.message
              } finally {
                busy = false
              }
            }
          }
        ) { Text("تسجيل") }
      },
      dismissButton = { TextButton(onClick = { showPay = false }, enabled = !busy) { Text("إلغاء") } }
    )
  }

  if (showDelete) {
    AlertDialog(
      onDismissRequest = { if (!busy) showDelete = false },
      title = { Text("حذف الفاتورة") },
      text = { Text("هل تريد حذف الفاتورة ${full.invoiceNo}؟") },
      confirmButton = {
        TextButton(
          enabled = !busy,
          onClick = {
            busy = true
            scope.launch {
              try {
                repo.deleteInvoice(full.id)
                onChanged()
              } catch (e: Exception) {
                error = e.message; busy = false
              }
            }
          }
        ) { Text("حذف", color = MaterialTheme.colorScheme.error) }
      },
      dismissButton = { TextButton(onClick = { showDelete = false }, enabled = !busy) { Text("إلغاء") } }
    )
  }
}