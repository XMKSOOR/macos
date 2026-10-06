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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.clinic.companion.data.ClinicRepo
import com.clinic.companion.data.Material
import com.clinic.companion.data.StockMovement
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MaterialsScreen(repo: ClinicRepo) {
  var loading by remember { mutableStateOf(true) }
  var error by remember { mutableStateOf<String?>(null) }
  var list by remember { mutableStateOf<List<Material>>(emptyList()) }
  var reloadKey by remember { mutableStateOf(0) }
  var editing by remember { mutableStateOf<Material?>(null) }
  var showEdit by remember { mutableStateOf(false) }
  var moving by remember { mutableStateOf<Material?>(null) }
  var showMovements by remember { mutableStateOf(false) }
  val scope = rememberCoroutineScope()

  LaunchedEffect(reloadKey) {
    loading = true; error = null
    try {
      list = repo.listMaterials()
    } catch (e: Exception) {
      error = e.message
    } finally {
      loading = false
    }
  }

  if (showMovements) {
    StockMovementsScreen(repo, onBack = { showMovements = false })
    return
  }

  Scaffold(
    topBar = {
      TopAppBar(
        title = { Text("المخزون (${list.size})") },
        actions = { TextButton(onClick = { showMovements = true }) { Text("الحركات") } }
      )
    },
    floatingActionButton = {
      FloatingActionButton(onClick = { editing = null; showEdit = true }) {
        Icon(Icons.Filled.Add, contentDescription = "إضافة مادة")
      }
    }
  ) { pad ->
    Box(Modifier.fillMaxSize().padding(pad)) {
      when {
        loading -> LoadingBox()
        error != null -> ErrorPane(error!!)
        list.isEmpty() -> EmptyBox("لا توجد مواد")
        else -> LazyColumn(
          Modifier.fillMaxSize(),
          contentPadding = PaddingValues(12.dp),
          verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
          items(list, key = { it.id }) { m ->
            val low = m.minQty > 0 && m.quantity <= m.minQty
            SectionCard(Modifier.clickable { moving = m }) {
              Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(m.name, fontWeight = FontWeight.SemiBold)
                Text(
                  "${trimNum(m.quantity)} ${m.unit}".trim(),
                  color = if (low) Color(0xFFD32F2F) else MaterialTheme.colorScheme.primary,
                  fontWeight = FontWeight.Bold
                )
              }
              if (m.category.isNotBlank()) Text(m.category, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
              Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("التكلفة: ${formatMoney(m.cost)}", style = MaterialTheme.typography.bodySmall)
                if (low) Text("منخفض", style = MaterialTheme.typography.bodySmall, color = Color(0xFFD32F2F))
              }
            }
          }
        }
      }
    }
  }

  if (showEdit) {
    MaterialEditDialog(
      item = editing,
      onDismiss = { showEdit = false },
      onSave = { name, category, unit, qty, minQty, cost, supplier, notes ->
        scope.launch {
          try {
            val cur = editing
            if (cur == null) repo.createMaterial(name, category, unit, qty, minQty, cost, supplier, notes)
            else repo.updateMaterial(cur.id, name, category, unit, qty, minQty, cost, supplier, notes)
            showEdit = false; reloadKey++
          } catch (e: Exception) {
            error = e.message; showEdit = false
          }
        }
      }
    )
  }

  moving?.let { m ->
    MaterialActionDialog(
      material = m,
      onDismiss = { moving = null },
      onEdit = { editing = m; moving = null; showEdit = true },
      onMove = { operation, qty, note ->
        scope.launch {
          try {
            val delta = when (operation) {
              "in" -> qty
              "out", "waste" -> -qty
              else -> qty - m.quantity
            }
            repo.adjustStock(m.id, delta, operation, "", "", note)
            moving = null; reloadKey++
          } catch (e: Exception) {
            error = e.message; moving = null
          }
        }
      }
    )
  }
}

@Composable
private fun MaterialEditDialog(
  item: Material?,
  onDismiss: () -> Unit,
  onSave: (String, String, String, Double, Double, Long, String, String) -> Unit
) {
  var name by remember { mutableStateOf(item?.name ?: "") }
  var category by remember { mutableStateOf(item?.category ?: "") }
  var unit by remember { mutableStateOf(item?.unit ?: "") }
  var qty by remember { mutableStateOf(item?.let { trimNum(it.quantity) } ?: "0") }
  var minQty by remember { mutableStateOf(item?.let { trimNum(it.minQty) } ?: "0") }
  var cost by remember { mutableStateOf(item?.let { moneyInput(it.cost) } ?: "") }
  var supplier by remember { mutableStateOf(item?.supplier ?: "") }
  var notes by remember { mutableStateOf(item?.notes ?: "") }
  var busy by remember { mutableStateOf(false) }

  AlertDialog(
    onDismissRequest = { if (!busy) onDismiss() },
    title = { Text(if (item == null) "إضافة مادة" else "تعديل مادة") },
    text = {
      Column(
        Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(8.dp)
      ) {
        LabeledField("الاسم", name) { name = it }
        LabeledField("التصنيف", category) { category = it }
        LabeledField("الوحدة", unit) { unit = it }
        LabeledField("الكمية", qty) { qty = it }
        LabeledField("حد التنبيه", minQty) { minQty = it }
        LabeledField("التكلفة", cost) { cost = it }
        LabeledField("المورد", supplier) { supplier = it }
        LabeledField("ملاحظات", notes, singleLine = false, minLines = 2) { notes = it }
      }
    },
    confirmButton = {
      TextButton(
        enabled = !busy && name.isNotBlank(),
        onClick = {
          busy = true
          onSave(name.trim(), category.trim(), unit.trim(), qty.toDoubleOrNull() ?: 0.0, minQty.toDoubleOrNull() ?: 0.0, parseMoney(cost), supplier.trim(), notes.trim())
        }
      ) { Text("حفظ") }
    },
    dismissButton = { TextButton(onClick = onDismiss, enabled = !busy) { Text("إلغاء") } }
  )
}

@Composable
private fun MaterialActionDialog(
  material: Material,
  onDismiss: () -> Unit,
  onEdit: () -> Unit,
  onMove: (String, Double, String) -> Unit
) {
  var qty by remember { mutableStateOf("1") }
  var note by remember { mutableStateOf("") }
  var busy by remember { mutableStateOf(false) }

  AlertDialog(
    onDismissRequest = { if (!busy) onDismiss() },
    title = { Text(material.name) },
    text = {
      Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("الكمية الحالية: ${trimNum(material.quantity)} ${material.unit}".trim())
        LabeledField("الكمية", qty) { qty = it }
        LabeledField("ملاحظة", note) { note = it }
        Text("اختر العملية:", style = MaterialTheme.typography.bodySmall)
      }
    },
    confirmButton = {
      Row {
        TextButton(onClick = { busy = true; onMove("in", qty.toDoubleOrNull() ?: 0.0, note) }, enabled = !busy) { Text("إدخال") }
        TextButton(onClick = { busy = true; onMove("out", qty.toDoubleOrNull() ?: 0.0, note) }, enabled = !busy) { Text("إخراج") }
        TextButton(onClick = { busy = true; onMove("waste", qty.toDoubleOrNull() ?: 0.0, note) }, enabled = !busy) { Text("هالك") }
        TextButton(onClick = { busy = true; onMove("adjust", qty.toDoubleOrNull() ?: 0.0, note) }, enabled = !busy) { Text("تصحيح") }
      }
    },
    dismissButton = {
      Row {
        TextButton(onClick = onEdit, enabled = !busy) { Text("تعديل") }
        TextButton(onClick = onDismiss, enabled = !busy) { Text("إغلاق") }
      }
    }
  )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun StockMovementsScreen(repo: ClinicRepo, onBack: () -> Unit) {
  var loading by remember { mutableStateOf(true) }
  var error by remember { mutableStateOf<String?>(null) }
  var list by remember { mutableStateOf<List<StockMovement>>(emptyList()) }

  LaunchedEffect(Unit) {
    try {
      list = repo.listStockMovements()
    } catch (e: Exception) {
      error = e.message
    } finally {
      loading = false
    }
  }

  Scaffold(
    topBar = {
      TopAppBar(
        title = { Text("حركات المخزون") },
        navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "رجوع") } }
      )
    }
  ) { pad ->
    Box(Modifier.fillMaxSize().padding(pad)) {
      when {
        loading -> LoadingBox()
        error != null -> ErrorPane(error!!)
        list.isEmpty() -> EmptyBox("لا توجد حركات")
        else -> LazyColumn(
          Modifier.fillMaxSize(),
          contentPadding = PaddingValues(12.dp),
          verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
          items(list, key = { it.id }) { mv ->
            SectionCard {
              Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(mv.materialName ?: "مادة #${mv.materialId}", fontWeight = FontWeight.SemiBold)
                Text(
                  (if (mv.qty >= 0) "+" else "") + trimNum(mv.qty),
                  color = if (mv.qty >= 0) Color(0xFF2E7D32) else Color(0xFFD32F2F),
                  fontWeight = FontWeight.Bold
                )
              }
              Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(mv.operation, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(mv.createdAt.take(10), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
              }
              if (mv.note.isNotBlank()) Text(mv.note, style = MaterialTheme.typography.bodySmall)
            }
          }
        }
      }
    }
  }
}

fun trimNum(v: Double): String =
  if (v % 1.0 == 0.0) v.toInt().toString() else "%.2f".format(v)