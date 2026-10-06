package com.clinic.companion.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import com.clinic.companion.data.ClinicRepo

private data class Tab(val label: String, val icon: ImageVector)

@Composable
fun MainScaffold(
  repo: ClinicRepo,
  email: String,
  onLogout: () -> Unit,
  onReconfigure: () -> Unit
) {
  val tabs = listOf(
    Tab("الرئيسية", Icons.Filled.Home),
    Tab("المرضى", Icons.Filled.People),
    Tab("المواعيد", Icons.Filled.CalendarMonth),
    Tab("الفواتير", Icons.Filled.ReceiptLong),
    Tab("الإعدادات", Icons.Filled.Settings)
  )
  var tab by remember { mutableIntStateOf(0) }

  Scaffold(
    bottomBar = {
      NavigationBar {
        tabs.forEachIndexed { i, t ->
          NavigationBarItem(
            selected = tab == i,
            onClick = { tab = i },
            icon = { Icon(t.icon, contentDescription = t.label) },
            label = { Text(t.label) }
          )
        }
      }
    }
  ) { pad ->
    Box(Modifier.padding(pad)) {
      when (tab) {
        0 -> DashboardScreen(repo)
        1 -> PatientsScreen(repo)
        2 -> AppointmentsScreen(repo)
        3 -> InvoicesScreen(repo)
        4 -> SettingsScreen(repo, email, onLogout, onReconfigure)
      }
    }
  }
}