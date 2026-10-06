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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
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
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.clinic.companion.data.CatalogItem
import com.clinic.companion.data.ClinicRepo
import com.clinic.companion.data.Material
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CatalogScreen(repo: ClinicRepo) {
  var loading by remember { mutableStateOf(true) }
  var error by remember { mutableStateOf<String?>(null) }
  var list by remember { mutableStateOf<List<CatalogItem>>(emptyList()) }
  var materials by remember { mutableStateOf<List<Material>>(emptyList()) }
  var editing by remember { mutableStateOf<CatalogItem?>(null) }
  var showEdit by remember { mutableStateOf(false) }
  var reloadKey by remember { mutableStateOf(0) }
  val scope = rememberCoroutineScope()

  LaunchedEffect(reloadKey) {
    loading = true; error = null
    try {
      list = repo.listCatalog()
      materials = repo.listMaterials()
    } catch (e: Exception) {
      error = e.message
    } finally {
      loading = false
    }
  }

  Scaffold(
    topBar = { TopAppBar(title = { Text("الكتالوج (${list.size})") }) },
    floatingActionButton = {
      FloatingActionButton(onClick = { editing = null; showEdit = true }) {
        Icon(Icons.Filled.Add, contentDescription = "إضافة صنف")
      }
    }
  ) { pad ->
    Box(Modifier.fillMaxSize().padding(pad)) {
      when {
        loading -> LoadingBox()
        error != null -> ErrorPane(error!!)
        list.isEmpty() -> EmptyBox("لا توجد أصناف")
        else -> LazyColumn(
          Modifier.fillMaxSize(),
          contentPadding = PaddingValues(12.dp),
          verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
          items(list, key = { it.id }) { item ->
            SectionCard(Modifier.clickable { editing = item; showEdit = true }) {
              Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(item.name, fontWeight = FontWeight.SemiBold)
                Text(formatMoney(item.price), color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
              }
              if (item.cost > 0) Text("التكلفة: ${formatMoney(item.cost)}", style = MaterialTheme.typography.bodySmall)
              if (item.materials.isNotEmpty()) {
                Text(
                  "المواد: " + item.materials.joinToString("، ") { "${it.name} (${it.qty})" },
                  style = MaterialTheme.typography.bodySmall,
                  color = MaterialTheme.colorScheme.onSurfaceVariant
                )
              }
            }
          }
        }
      }
    }
  }

  if (showEdit) {
    CatalogEditDialog(
      item = editing,
      materials = materials,
      onDismiss = { showEdit = false },
      onSave = { name, price, cost, desc, mats ->
        scope.launch {
          try {
            val cur = editing
            if (cur == null) repo.createCatalog(name, price, cost, desc, mats)
            else repo.updateCatalog(cur.id, name, price, cost, desc, mats)
            showEdit = false
            reloadKey++
          } catch (e: Exception) {
            error = e.message
            showEdit = false
          }
        }
      }
    )
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CatalogEditDialog(
  item: CatalogItem?,
  materials: List<Material>,
  onDismiss: () -> Unit,
  onSave: (String, Long, Long, String, List<Pair<Long, Double>>) -> Unit
) {
  var name by remember { mutableStateOf(item?.name ?: "") }
  var price by remember { mutableStateOf(item?.let { moneyInput(it.price) } ?: "") }
  var cost by remember { mutableStateOf(item?.let { if (it.cost % 100 == 0L) (it.cost / 100).toString() else (it.cost / 100.0).toString() } ?: "") }
  var desc by remember { mutableStateOf(item?.description ?: "") }
  var busy by remember { mutableStateOf(false) }
  val selected = remember {
    mutableStateMapOf<Long, String>().apply {
      item?.materials?.forEach { put(it.materialId, if (it.qty % 1.0 == 0.0) it.qty.toInt().toString() else it.qty.toString()) }
    }
  }

  AlertDialog(
    onDismissRequest = { if (!busy) onDismiss() },
    title = { Text(if (item == null) "إضافة صنف" else "تعديل صنف") },
    text = {
      Column(
        Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(8.dp)
      ) {
        LabeledField("الاسم", name) { name = it }
        LabeledField("السعر", price) { price = it }
        LabeledField("التكلفة", cost) { cost = it }
        LabeledField("الوصف", desc, singleLine = false, minLines = 2) { desc = it }
        if (materials.isNotEmpty()) {
          Text("المواد المستهلكة", style = MaterialTheme.typography.titleSmall)
          materials.forEach { m ->
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
              Checkbox(
                checked = selected.containsKey(m.id),
                onCheckedChange = { ck -> if (ck) selected[m.id] = "1" else selected.remove(m.id) }
              )
              Text(m.name, Modifier.weight(1f))
              if (selected.containsKey(m.id)) {
                OutlinedTextField(
                  value = selected[m.id] ?: "",
                  onValueChange = { selected[m.id] = it },
                  singleLine = true,
                  label = { Text("الكمية") },
                  modifier = Modifier.width(110.dp)
                )
              }
            }
          }
        }
      }
    },
    confirmButton = {
      TextButton(
        enabled = !busy && name.isNotBlank(),
        onClick = {
          busy = true
          val mats = selected.entries.mapNotNull { (mid, q) ->
            val qty = q.toDoubleOrNull() ?: 0.0
            if (qty > 0) mid to qty else null
          }
          onSave(name.trim(), parseMoney(price), parseMoney(cost), desc.trim(), mats)
        }
      ) { Text("حفظ") }
    },
    dismissButton = { TextButton(onClick = onDismiss, enabled = !busy) { Text("إلغاء") } }
  )
}