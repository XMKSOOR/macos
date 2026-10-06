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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.Scaffold
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
import com.clinic.companion.data.Expense
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExpensesScreen(repo: ClinicRepo, userName: String) {
  var loading by remember { mutableStateOf(true) }
  var error by remember { mutableStateOf<String?>(null) }
  var list by remember { mutableStateOf<List<Expense>>(emptyList()) }
  var reloadKey by remember { mutableStateOf(0) }
  var editing by remember { mutableStateOf<Expense?>(null) }
  var showEdit by remember { mutableStateOf(false) }
  val scope = rememberCoroutineScope()

  LaunchedEffect(reloadKey) {
    loading = true; error = null
    try {
      list = repo.listExpenses()
    } catch (e: Exception) {
      error = e.message
    } finally {
      loading = false
    }
  }

  Scaffold(
    topBar = { TopAppBar(title = { Text("المصروفات (${list.size})") }) },
    floatingActionButton = {
      FloatingActionButton(onClick = { editing = null; showEdit = true }) {
        Icon(Icons.Filled.Add, contentDescription = "إضافة مصروف")
      }
    }
  ) { pad ->
    Box(Modifier.fillMaxSize().padding(pad)) {
      when {
        loading -> LoadingBox()
        error != null -> ErrorPane(error!!)
        list.isEmpty() -> EmptyBox("لا توجد مصروفات")
        else -> LazyColumn(
          Modifier.fillMaxSize(),
          contentPadding = PaddingValues(12.dp),
          verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
          items(list, key = { it.id }) { e ->
            SectionCard(Modifier.clickable { editing = e; showEdit = true }) {
              Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(e.category.ifBlank { "مصروف" }, fontWeight = FontWeight.SemiBold)
                Text(formatMoney(e.amount), color = MaterialTheme.colorScheme.error, fontWeight = FontWeight.Bold)
              }
              Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(e.date, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (e.isRecurring == 1) Text("متكرر: ${e.recurrence}", style = MaterialTheme.typography.bodySmall)
              }
              if (e.note.isNotBlank()) Text(e.note, style = MaterialTheme.typography.bodySmall)
            }
          }
        }
      }
    }
  }

  if (showEdit) {
    ExpenseEditDialog(
      item = editing,
      onDismiss = { showEdit = false },
      onDelete = editing?.let { e ->
        {
          scope.launch {
            try { repo.deleteExpense(e.id); showEdit = false; reloadKey++ }
            catch (ex: Exception) { error = ex.message; showEdit = false }
          }
        }
      },
      onSave = { category, amount, date, note, recurring, recurrence ->
        scope.launch {
          try {
            val cur = editing
            if (cur == null) repo.createExpense(category, amount, date, note, userName, recurring, recurrence)
            else repo.updateExpense(cur.id, category, amount, date, note, recurring, recurrence)
            showEdit = false; reloadKey++
          } catch (ex: Exception) {
            error = ex.message; showEdit = false
          }
        }
      }
    )
  }
}

@Composable
private fun ExpenseEditDialog(
  item: Expense?,
  onDismiss: () -> Unit,
  onDelete: (() -> Unit)?,
  onSave: (String, Long, String, String, Boolean, String) -> Unit
) {
  var category by remember { mutableStateOf(item?.category ?: "") }
  var amount by remember { mutableStateOf(item?.let { moneyInput(it.amount) } ?: "") }
  var date by remember { mutableStateOf(item?.date?.ifBlank { null } ?: today()) }
  var note by remember { mutableStateOf(item?.note ?: "") }
  var recurring by remember { mutableStateOf(item?.isRecurring == 1) }
  var recurrence by remember { mutableStateOf(item?.recurrence?.ifBlank { null } ?: "monthly") }
  var busy by remember { mutableStateOf(false) }

  AlertDialog(
    onDismissRequest = { if (!busy) onDismiss() },
    title = { Text(if (item == null) "إضافة مصروف" else "تعديل مصروف") },
    text = {
      Column(
        Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(8.dp)
      ) {
        LabeledField("التصنيف", category) { category = it }
        LabeledField("المبلغ", amount) { amount = it }
        LabeledField("التاريخ (YYYY-MM-DD)", date) { date = it }
        LabeledField("ملاحظة", note, singleLine = false, minLines = 2) { note = it }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
          Text("متكرر", fontWeight = FontWeight.Medium)
          Switch(checked = recurring, onCheckedChange = { recurring = it })
        }
        if (recurring) {
          Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            listOf("monthly" to "شهري", "weekly" to "أسبوعي", "quarterly" to "ربع سنوي", "yearly" to "سنوي").forEach { (v, l) ->
              TextButton(onClick = { recurrence = v }) {
                Text(l, color = if (recurrence == v) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
              }
            }
          }
        }
      }
    },
    confirmButton = {
      TextButton(
        enabled = !busy && amount.isNotBlank(),
        onClick = {
          busy = true
          onSave(category.trim(), parseMoney(amount), date.trim(), note.trim(), recurring, recurrence)
        }
      ) { Text("حفظ") }
    },
    dismissButton = {
      Row {
        if (onDelete != null) TextButton(onClick = { busy = true; onDelete() }, enabled = !busy) { Text("حذف", color = MaterialTheme.colorScheme.error) }
        TextButton(onClick = onDismiss, enabled = !busy) { Text("إلغاء") }
      }
    }
  )
}