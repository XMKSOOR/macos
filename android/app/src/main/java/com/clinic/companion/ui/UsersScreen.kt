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
import com.clinic.companion.data.AppUser
import com.clinic.companion.data.ClinicRepo
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UsersScreen(repo: ClinicRepo) {
  var loading by remember { mutableStateOf(true) }
  var error by remember { mutableStateOf<String?>(null) }
  var list by remember { mutableStateOf<List<AppUser>>(emptyList()) }
  var reloadKey by remember { mutableStateOf(0) }
  var editing by remember { mutableStateOf<AppUser?>(null) }
  var showEdit by remember { mutableStateOf(false) }
  val scope = rememberCoroutineScope()

  LaunchedEffect(reloadKey) {
    loading = true; error = null
    try {
      list = repo.listUsers()
    } catch (e: Exception) {
      error = e.message
    } finally {
      loading = false
    }
  }

  Scaffold(
    topBar = { TopAppBar(title = { Text("المستخدمون (${list.size})") }) },
    floatingActionButton = {
      FloatingActionButton(onClick = { editing = null; showEdit = true }) {
        Icon(Icons.Filled.Add, contentDescription = "إضافة مستخدم")
      }
    }
  ) { pad ->
    Box(Modifier.fillMaxSize().padding(pad)) {
      when {
        loading -> LoadingBox()
        error != null -> ErrorPane(error!!)
        list.isEmpty() -> EmptyBox("لا يوجد مستخدمون")
        else -> LazyColumn(
          Modifier.fillMaxSize(),
          contentPadding = PaddingValues(12.dp),
          verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
          items(list, key = { it.id }) { u ->
            SectionCard(Modifier.clickable { editing = u; showEdit = true }) {
              Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(u.fullName.ifBlank { u.username }, fontWeight = FontWeight.SemiBold)
                Text(roleLabel(u.role), color = MaterialTheme.colorScheme.primary)
              }
              Text(u.username, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
          }
        }
      }
    }
  }

  if (showEdit) {
    UserEditDialog(
      item = editing,
      onDismiss = { showEdit = false },
      onDelete = editing?.let { u ->
        {
          scope.launch {
            try { repo.deleteUser(u.id); showEdit = false; reloadKey++ }
            catch (ex: Exception) { error = ex.message; showEdit = false }
          }
        }
      },
      onSave = { username, fullName, role, password ->
        scope.launch {
          try {
            val cur = editing
            if (cur == null) repo.createUser(username, password, role, fullName)
            else repo.updateUser(cur.id, username, role, fullName, password)
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
private fun UserEditDialog(
  item: AppUser?,
  onDismiss: () -> Unit,
  onDelete: (() -> Unit)?,
  onSave: (String, String, String, String) -> Unit
) {
  var username by remember { mutableStateOf(item?.username ?: "") }
  var fullName by remember { mutableStateOf(item?.fullName ?: "") }
  var role by remember { mutableStateOf(item?.role?.ifBlank { null } ?: "user") }
  var password by remember { mutableStateOf("") }
  var busy by remember { mutableStateOf(false) }

  AlertDialog(
    onDismissRequest = { if (!busy) onDismiss() },
    title = { Text(if (item == null) "إضافة مستخدم" else "تعديل مستخدم") },
    text = {
      Column(
        Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(8.dp)
      ) {
        LabeledField("اسم المستخدم", username) { username = it }
        LabeledField("الاسم الكامل", fullName) { fullName = it }
        Text("الصلاحية", style = MaterialTheme.typography.labelMedium)
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
          listOf("admin" to "مدير", "user" to "مستخدم", "viewer" to "قراءة فقط").forEach { (v, l) ->
            TextButton(onClick = { role = v }) {
              Text(l, color = if (role == v) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
            }
          }
        }
        LabeledField(if (item == null) "كلمة المرور" else "كلمة مرور جديدة (اختياري)", password) { password = it }
      }
    },
    confirmButton = {
      TextButton(
        enabled = !busy && username.isNotBlank() && (item != null || password.isNotBlank()),
        onClick = {
          busy = true
          onSave(username.trim(), fullName.trim(), role, password)
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

private fun roleLabel(role: String): String = when (role) {
  "admin" -> "مدير"
  "viewer" -> "قراءة فقط"
  else -> "مستخدم"
}