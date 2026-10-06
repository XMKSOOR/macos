package com.clinic.companion.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
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
import com.clinic.companion.data.Medicine

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MedicinesScreen(repo: ClinicRepo) {
  var loading by remember { mutableStateOf(true) }
  var error by remember { mutableStateOf<String?>(null) }
  var list by remember { mutableStateOf<List<Medicine>>(emptyList()) }
  var query by remember { mutableStateOf("") }

  LaunchedEffect(Unit) {
    try {
      list = repo.medicines()
    } catch (e: Exception) {
      error = e.message
    } finally {
      loading = false
    }
  }

  val filtered = list.filter {
    query.isBlank() || it.tradeName.contains(query, true) || it.scientificName.contains(query, true)
  }

  Scaffold(topBar = { TopAppBar(title = { Text("دليل الأدوية (${list.size})") }) }) { pad ->
    Column(Modifier.fillMaxSize().padding(pad)) {
      Box(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
        LabeledField("بحث", query) { query = it }
      }
      when {
        loading -> LoadingBox()
        error != null -> ErrorPane(error!!)
        filtered.isEmpty() -> EmptyBox("لا توجد أدوية")
        else -> LazyColumn(
          Modifier.fillMaxSize(),
          contentPadding = PaddingValues(12.dp),
          verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
          items(filtered, key = { it.id }) { m ->
            SectionCard {
              Text(m.tradeName, fontWeight = FontWeight.SemiBold)
              if (m.scientificName.isNotBlank()) Text(m.scientificName, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
              val parts = listOf(m.dose, m.form, m.route, m.frequency).filter { it.isNotBlank() }
              if (parts.isNotEmpty()) Text(parts.joinToString(" • "), style = MaterialTheme.typography.bodySmall)
            }
          }
        }
      }
    }
  }
}