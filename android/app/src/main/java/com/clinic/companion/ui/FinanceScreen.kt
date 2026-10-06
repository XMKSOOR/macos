package com.clinic.companion.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.clinic.companion.data.ClinicRepo
import com.clinic.companion.data.Expense
import com.clinic.companion.data.Invoice
import com.clinic.companion.data.Material

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FinanceScreen(repo: ClinicRepo) {
  var loading by remember { mutableStateOf(true) }
  var error by remember { mutableStateOf<String?>(null) }
  var invoices by remember { mutableStateOf<List<Invoice>>(emptyList()) }
  var expenses by remember { mutableStateOf<List<Expense>>(emptyList()) }
  var materials by remember { mutableStateOf<List<Material>>(emptyList()) }

  LaunchedEffect(Unit) {
    try {
      invoices = repo.invoices()
      expenses = repo.listExpenses()
      materials = repo.listMaterials()
    } catch (e: Exception) {
      error = e.message
    } finally {
      loading = false
    }
  }

  Scaffold(topBar = { TopAppBar(title = { Text("التقارير المالية") }) }) { pad ->
    Box(Modifier.fillMaxSize().padding(pad)) {
      when {
        loading -> LoadingBox()
        error != null -> ErrorPane(error!!)
        else -> {
          val totalInvoiced = invoices.sumOf { it.total }
          val collected = invoices.sumOf { it.paid }
          val outstanding = totalInvoiced - collected
          val totalExpenses = expenses.sumOf { it.amount }
          val net = collected - totalExpenses
          val lowStock = materials.filter { it.minQty > 0 && it.quantity <= it.minQty }

          Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
          ) {
            SectionCard {
              Text("ملخص إجمالي", fontWeight = FontWeight.SemiBold)
              InfoRow("عدد الفواتير", invoices.size.toString())
              InfoRow("إجمالي الفواتير", formatMoney(totalInvoiced))
              InfoRow("المحصَّل", formatMoney(collected))
              InfoRow("المتبقي (ديون)", formatMoney(outstanding))
              InfoRow("إجمالي المصروفات", formatMoney(totalExpenses))
              Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("الصافي", fontWeight = FontWeight.Bold)
                Text(
                  formatMoney(net),
                  fontWeight = FontWeight.Bold,
                  color = if (net >= 0) Color(0xFF2E7D32) else Color(0xFFD32F2F)
                )
              }
            }

            val byCategory = expenses.groupBy { it.category.ifBlank { "غير مصنف" } }
            if (byCategory.isNotEmpty()) {
              SectionCard {
                Text("المصروفات حسب التصنيف", fontWeight = FontWeight.SemiBold)
                byCategory.forEach { (cat, items) ->
                  Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(cat)
                    Text(formatMoney(items.sumOf { it.amount }))
                  }
                }
              }
            }

            if (lowStock.isNotEmpty()) {
              SectionCard {
                Text("مواد منخفضة المخزون (${lowStock.size})", fontWeight = FontWeight.SemiBold, color = Color(0xFFD32F2F))
                lowStock.forEach { m ->
                  Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(m.name)
                    Text("${trimNum(m.quantity)} ${m.unit}".trim(), color = Color(0xFFD32F2F))
                  }
                }
              }
            }

            val unpaid = invoices.filter { it.status != "paid" }
            if (unpaid.isNotEmpty()) {
              SectionCard {
                Text("فواتير غير مسددة (${unpaid.size})", fontWeight = FontWeight.SemiBold)
                unpaid.take(20).forEach { inv ->
                  Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("#${inv.invoiceNo}  ${inv.patientName ?: ""}".trim())
                    Text(formatMoney(inv.total - inv.paid), color = MaterialTheme.colorScheme.error)
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}