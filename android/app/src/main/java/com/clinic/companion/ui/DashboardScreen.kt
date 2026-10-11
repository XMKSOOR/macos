package com.clinic.companion.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.clinic.companion.data.ClinicRepo
import com.clinic.companion.data.DashboardStats
import com.clinic.companion.data.DayStat
import com.clinic.companion.data.Invoice

private val ColorIncome = Color(0xFF0E7C66)
private val ColorExpense = Color(0xFFDC2626)
private val ColorPartial = Color(0xFFD97706)

@Composable
fun DashboardScreen(repo: ClinicRepo) {
  val periods = listOf(7 to "آخر 7 أيام", 30 to "آخر 30 يوماً", 365 to "العام")
  var periodIdx by remember { mutableIntStateOf(0) }
  var loading by remember { mutableStateOf(true) }
  var error by remember { mutableStateOf<String?>(null) }
  var stats by remember { mutableStateOf<DashboardStats?>(null) }
  var rate by remember { mutableStateOf(130.0) }
  var refreshKey by remember { mutableIntStateOf(0) }

  LaunchedEffect(periodIdx, refreshKey) {
    loading = true; error = null
    try {
      stats = repo.dashboardStats(periods[periodIdx].first)
      rate = repo.usdRate().takeIf { it > 0 } ?: 130.0
    } catch (e: Exception) {
      error = e.message
    } finally {
      loading = false
    }
  }

  Column(
    Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
    verticalArrangement = Arrangement.spacedBy(12.dp)
  ) {
    Row(
      Modifier.fillMaxWidth(),
      horizontalArrangement = Arrangement.SpaceBetween,
      verticalAlignment = Alignment.CenterVertically
    ) {
      Text("لوحة الملخص", style = MaterialTheme.typography.headlineSmall)
      IconButton(onClick = { refreshKey++ }) {
        Icon(Icons.Filled.Refresh, contentDescription = "تحديث")
      }
    }

    Row(
      Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
      horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
      periods.forEachIndexed { i, (_, label) ->
        FilterChip(selected = periodIdx == i, onClick = { periodIdx = i }, label = { Text(label) })
      }
    }

    if (loading) {
      LoadingBox(message = "جارٍ تحميل الملخص…")
    } else if (error != null) {
      ErrorPane(error!!, onRetry = { refreshKey++ })
    } else {
      val s = stats ?: return@Column
      SummaryCards(s, rate)
      DailyChartPanel(s.daily)
      RecentInvoices(s, rate)
    }
  }
}

@Composable
private fun SummaryCards(s: DashboardStats, rate: Double) {
  val net = s.income - s.expenses
  val confTotal = s.income + s.expenses
  val conf = if (confTotal > 0) Math.round((s.income.toDouble() / confTotal) * 100) else 0
  val netColor = if (net >= 0) ColorIncome else ColorExpense

  Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
    StatCard("إجمالي المرضى", s.patientsCount.toString(), Modifier.weight(1f), sub = "مريض مسجل")
    StatCard("مواعيد اليوم", s.todayAppointments.toString(), Modifier.weight(1f), sub = "منها ${s.upcomingAppointments} قادم")
  }
  Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
    StatMoneyCard("الدخل المحصَّل", s.income, rate, Modifier.weight(1f))
    StatMoneyCard("المصاريف", s.expenses, rate, Modifier.weight(1f))
  }
  Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
    StatMoneyCard("صافي الربح", net, rate, Modifier.weight(1f), color = netColor)
    StatCard("الذمم غير المحصلة", formatMoney(s.unpaidTotal), Modifier.weight(1f), color = ColorExpense, sub = usdLabel(s.unpaidTotal, rate))
  }
  Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
    StatMoneyCard("الربح الأصيل (بعد كلفة البيع)", s.income - s.soldCost - s.expenses, rate, Modifier.weight(1f))
    StatCard("مواد تحت الحد الأدنى", s.lowMaterials.toString(), Modifier.weight(1f), color = if (s.lowMaterials > 0) ColorPartial else ColorIncome, sub = "مادة بكمية حرجة")
  }
  Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
    StatCard("نسبة التحصيل", "$conf%", Modifier.weight(1f), sub = "من الدخل الإجمالي")
  }
}

@Composable
private fun StatCard(
  label: String,
  value: String,
  modifier: Modifier = Modifier,
  color: Color = MaterialTheme.colorScheme.primary,
  sub: String? = null
) {
  SectionCard(modifier) {
    Text(value, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = color)
    Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant)
    if (sub != null) Text(sub, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
  }
}

@Composable
private fun StatMoneyCard(label: String, lbp: Long, rate: Double, modifier: Modifier = Modifier, color: Color = MaterialTheme.colorScheme.primary) {
  SectionCard(modifier) {
    Text(usdLabel(lbp, rate), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = color)
    Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant)
    Text("${formatMoney(lbp)} ل.س", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
  }
}

@Composable
private fun DailyChartPanel(daily: List<DayStat>) {
  SectionCard {
    Text("الدخل والمصاريف يومياً", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
    if (daily.isEmpty()) {
      Text("لا توجد بيانات في هذه الفترة", color = MaterialTheme.colorScheme.onSurfaceVariant)
      return@SectionCard
    }
    val max = daily.maxOf { maxOf(it.income, it.expenses) }.coerceAtLeast(1L)
    Box(Modifier.fillMaxWidth().height(150.dp)) {
      Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.Bottom
      ) {
        daily.forEach { d ->
          Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Bottom
          ) {
            Row(horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.Bottom) {
              ChartBar(d.income, max, ColorIncome)
              ChartBar(d.expenses, max, ColorExpense)
            }
            if (daily.size <= 31) {
              Text(d.date.take(5), fontSize = 8.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
          }
        }
      }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
      LegendDot(ColorIncome, "الدخل")
      LegendDot(ColorExpense, "المصاريف")
    }
  }
}

@Composable
private fun ChartBar(v: Long, max: Long, color: Color) {
  val fraction = v.toFloat() / max.toFloat()
  val h = if (v > 0) (120.dp * fraction).coerceAtLeast(3.dp) else 1.dp
  val c = if (v > 0) color else color.copy(alpha = 0.25f)
  Box(
    Modifier.width(6.dp).height(h)
      .background(c, RoundedCornerShape(topStart = 2.dp, topEnd = 2.dp))
  )
}

@Composable
private fun LegendDot(color: Color, label: String) {
  Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
    Box(Modifier.width(12.dp).height(12.dp).background(color, RoundedCornerShape(3.dp)))
    Text(label, style = MaterialTheme.typography.bodySmall)
  }
}

@Composable
private fun RecentInvoices(s: DashboardStats, rate: Double) {
  CardPanel {
    Text("أحدث الفواتير", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
    if (s.recentInvoices.isEmpty()) {
      Text("لا توجد فواتير بعد", color = MaterialTheme.colorScheme.onSurfaceVariant)
      return@CardPanel
    }
    s.recentInvoices.forEach { inv ->
      InvoiceRow(inv, nameOf(s, inv), rate)
    }
  }
}

@Composable
private fun nameOf(s: DashboardStats, inv: Invoice): String =
  s.patients.firstOrNull { it.id == inv.patientId }?.name ?: "مريض #${inv.patientId}"

@Composable
private fun InvoiceRow(inv: Invoice, patientName: String, rate: Double) {
  Column(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
      Text("#${inv.invoiceNo}", fontWeight = FontWeight.SemiBold)
      StatusLabel(inv.status)
    }
    Text(patientName, color = MaterialTheme.colorScheme.onSurfaceVariant)
    Text(
      "${inv.date}  ${formatMoney(inv.total)} ل.س  (${usdLabel(inv.total, rate)})",
      color = MaterialTheme.colorScheme.onSurfaceVariant,
      style = MaterialTheme.typography.bodySmall
    )
  }
}

@Composable
private fun StatusLabel(status: String) {
  val (text, color) = when (status) {
    "paid" -> "مدفوعة" to ColorIncome
    "partial" -> "جزئية" to ColorPartial
    else -> "غير مدفوعة" to ColorExpense
  }
  Text(text, color = color, fontWeight = FontWeight.SemiBold)
}

private fun usdLabel(lbp: Long, rate: Double): String =
  if (rate > 0) "$%,.2f".format(lbp / rate) else "—"

@Composable
private fun CardPanel(content: @Composable () -> Unit) {
  androidx.compose.material3.Card(
    Modifier.fillMaxWidth(),
    shape = RoundedCornerShape(16.dp),
    colors = androidx.compose.material3.CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
  ) {
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { content() }
  }
}