package com.clinic.companion.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
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
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.clinic.companion.data.CatalogItem
import com.clinic.companion.data.ClinicRepo
import com.clinic.companion.data.DraftItem
import com.clinic.companion.data.Patient
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InvoiceEditorScreen(repo: ClinicRepo, userName: String, onDone: () -> Unit, onCancel: () -> Unit) {
  var loading by remember { mutableStateOf(true) }
  var error by remember { mutableStateOf<String?>(null) }
  var patients by remember { mutableStateOf<List<Patient>>(emptyList()) }
  var catalog by remember { mutableStateOf<List<CatalogItem>>(emptyList()) }
  var rate by remember { mutableStateOf(130.0) }

  var patient by remember { mutableStateOf<Patient?>(null) }
  var date by remember { mutableStateOf(today()) }
  var discount by remember { mutableStateOf("") }
  var notes by remember { mutableStateOf("") }
  val items = remember { mutableStateListOf<DraftItem>() }

  var showPatientPicker by remember { mutableStateOf(false) }
  var showCatalogPicker by remember { mutableStateOf(false) }
  var showFreeItem by remember { mutableStateOf(false) }
  var busy by remember { mutableStateOf(false) }
  val scope = rememberCoroutineScope()

  LaunchedEffect(Unit) {
    try {
      patients = repo.listPatients("")
      catalog = repo.listCatalog()
      rate = repo.usdRate()
    } catch (e: Exception) {
      error = e.message
    } finally {
      loading = false
    }
  }

  val subtotal = items.sumOf { it.cost * it.qty }
  val total = maxOf(0L, subtotal - parseMoney(discount))

  Scaffold(
    topBar = {
      TopAppBar(
        title = { Text("فاتورة جديدة") },
        navigationIcon = { IconButton(onClick = onCancel) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "رجوع") } },
        actions = {
          TextButton(
            enabled = !busy && patient != null && items.isNotEmpty(),
            onClick = {
              busy = true
              scope.launch {
                try {
                  repo.createInvoice(patient!!.id, date, rate, parseMoney(discount), notes.trim(), items.toList(), userName)
                  onDone()
                } catch (e: Exception) {
                  error = e.message; busy = false
                }
              }
            }
          ) { Text("حفظ") }
        }
      )
    }
  ) { pad ->
    if (loading) { Box(Modifier.fillMaxSize().padding(pad)) { LoadingBox() }; return@Scaffold }
    Column(
      Modifier.fillMaxSize().padding(pad).verticalScroll(rememberScrollState()).padding(12.dp),
      verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
      if (error != null) Text(error!!, color = MaterialTheme.colorScheme.error)

      SectionCard(Modifier.clickable { showPatientPicker = true }) {
        Text("المريض", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(patient?.name ?: "اختر المريض", fontWeight = FontWeight.SemiBold)
      }

      SectionCard {
        LabeledField("التاريخ (YYYY-MM-DD)", date) { date = it }
        LabeledField("الخصم", discount) { discount = it }
        LabeledField("ملاحظات", notes, singleLine = false, minLines = 2) { notes = it }
        InfoRow("سعر الصرف", rate.toString())
      }

      Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        TextButton(onClick = { showCatalogPicker = true }) { Text("+ من الكتالوج") }
        TextButton(onClick = { showFreeItem = true }) { Text("+ بند يدوي") }
      }

      items.forEachIndexed { i, item ->
        SectionCard {
          Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("${item.name} × ${item.qty}", fontWeight = FontWeight.Medium)
            Text(formatMoney(item.cost * item.qty))
          }
          Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("سعر الوحدة: ${formatMoney(item.cost)}", style = MaterialTheme.typography.bodySmall)
            TextButton(onClick = { items.removeAt(i) }) { Text("حذف", color = MaterialTheme.colorScheme.error) }
          }
        }
      }

      SectionCard {
        InfoRow("المجموع الفرعي", formatMoney(subtotal))
        InfoRow("الخصم", formatMoney(parseMoney(discount)))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
          Text("الإجمالي", fontWeight = FontWeight.Bold)
          Text(formatMoney(total), fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
        }
      }
    }
  }

  if (showPatientPicker) {
    PickerDialog(
      title = "اختر المريض",
      rows = patients.map { it.id to (it.name + if (it.phone.isNotBlank()) " • ${it.phone}" else "") },
      onDismiss = { showPatientPicker = false },
      onPick = { id -> patient = patients.firstOrNull { it.id == id }; showPatientPicker = false }
    )
  }

  if (showCatalogPicker) {
    PickerDialog(
      title = "اختر صنفاً",
      rows = catalog.map { it.id to ("${it.name} • ${formatMoney(it.price)}") },
      onDismiss = { showCatalogPicker = false },
      onPick = { id ->
        catalog.firstOrNull { it.id == id }?.let { c ->
          items.add(DraftItem(name = c.name, cost = c.price, qty = 1, catalogId = c.id))
        }
        showCatalogPicker = false
      }
    )
  }

  if (showFreeItem) {
    FreeItemDialog(
      onDismiss = { showFreeItem = false },
      onAdd = { name, cost, qty ->
        items.add(DraftItem(name = name, cost = parseMoney(cost), qty = qty))
        showFreeItem = false
      }
    )
  }
}

@Composable
private fun PickerDialog(
  title: String,
  rows: List<Pair<Long, String>>,
  onDismiss: () -> Unit,
  onPick: (Long) -> Unit
) {
  var query by remember { mutableStateOf("") }
  val filtered = rows.filter { query.isBlank() || it.second.contains(query, ignoreCase = true) }
  AlertDialog(
    onDismissRequest = onDismiss,
    title = { Text(title) },
    text = {
      Column(Modifier.heightIn(max = 420.dp)) {
        LabeledField("بحث", query) { query = it }
        LazyColumn(Modifier.fillMaxWidth().heightIn(max = 320.dp), contentPadding = PaddingValues(vertical = 8.dp)) {
          items(filtered, key = { it.first }) { row ->
            Text(
              row.second,
              Modifier.fillMaxWidth().clickable { onPick(row.first) }.padding(vertical = 12.dp, horizontal = 4.dp)
            )
          }
        }
      }
    },
    confirmButton = { TextButton(onClick = onDismiss) { Text("إغلاق") } }
  )
}

@Composable
private fun FreeItemDialog(
  onDismiss: () -> Unit,
  onAdd: (String, String, Long) -> Unit
) {
  var name by remember { mutableStateOf("") }
  var cost by remember { mutableStateOf("") }
  var qty by remember { mutableStateOf("1") }

  AlertDialog(
    onDismissRequest = onDismiss,
    title = { Text("بند يدوي") },
    text = {
      Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        LabeledField("الاسم", name) { name = it }
        LabeledField("سعر الوحدة", cost) { cost = it }
        LabeledField("الكمية", qty) { qty = it }
      }
    },
    confirmButton = {
      TextButton(enabled = name.isNotBlank(), onClick = { onAdd(name.trim(), cost, qty.toLongOrNull() ?: 1L) }) { Text("إضافة") }
    },
    dismissButton = { TextButton(onClick = onDismiss) { Text("إلغاء") } }
  )
}