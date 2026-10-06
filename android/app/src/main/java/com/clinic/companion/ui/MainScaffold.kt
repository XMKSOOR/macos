package com.clinic.companion.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Medication
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Money
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.NavigationDrawerItemDefaults
import androidx.compose.material3.SmallFloatingActionButton
import androidx.compose.material3.Text
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.clinic.companion.data.ClinicRepo
import kotlinx.coroutines.launch

private data class NavItem(val label: String, val icon: ImageVector)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScaffold(
  repo: ClinicRepo,
  email: String,
  onLogout: () -> Unit,
  onReconfigure: () -> Unit
) {
  val items = listOf(
    NavItem("الرئيسية", Icons.Filled.Home),
    NavItem("المرضى", Icons.Filled.People),
    NavItem("المواعيد", Icons.Filled.CalendarMonth),
    NavItem("الفواتير", Icons.AutoMirrored.Filled.ReceiptLong),
    NavItem("الكتالوج", Icons.Filled.ShoppingCart),
    NavItem("المخزون", Icons.Filled.Inventory2),
    NavItem("المصروفات", Icons.Filled.Money),
    NavItem("المالية", Icons.Filled.Person),
    NavItem("الأدوية", Icons.Filled.Medication),
    NavItem("المستخدمون", Icons.Filled.People),
    NavItem("الإعدادات", Icons.Filled.Settings)
  )
  var index by remember { mutableIntStateOf(0) }
  val drawerState = rememberDrawerState(DrawerValue.Closed)
  val scope = rememberCoroutineScope()

  ModalNavigationDrawer(
    drawerState = drawerState,
    gesturesEnabled = true,
    drawerContent = {
      ModalDrawerSheet {
        Text(
          "عيادة الأسنان",
          modifier = Modifier.padding(16.dp),
          style = androidx.compose.material3.MaterialTheme.typography.titleLarge
        )
        items.forEachIndexed { i, item ->
          NavigationDrawerItem(
            label = { Text(item.label) },
            icon = { Icon(item.icon, contentDescription = item.label) },
            selected = index == i,
            onClick = {
              index = i
              scope.launch { drawerState.close() }
            },
            modifier = Modifier.padding(NavigationDrawerItemDefaults.ItemPadding)
          )
        }
      }
    }
  ) {
    Box(Modifier.fillMaxSize()) {
      when (index) {
        0 -> DashboardScreen(repo)
        1 -> PatientsScreen(repo)
        2 -> AppointmentsScreen(repo)
        3 -> InvoicesScreen(repo, email)
        4 -> CatalogScreen(repo)
        5 -> MaterialsScreen(repo)
        6 -> ExpensesScreen(repo, email)
        7 -> FinanceScreen(repo)
        8 -> MedicinesScreen(repo)
        9 -> UsersScreen(repo)
        10 -> SettingsScreen(repo, email, onLogout, onReconfigure)
      }

      SmallFloatingActionButton(
        onClick = { scope.launch { if (drawerState.isClosed) drawerState.open() else drawerState.close() } },
        modifier = Modifier.align(Alignment.BottomStart).padding(16.dp)
      ) {
        Icon(Icons.Filled.Menu, contentDescription = "القائمة")
      }
    }
  }
}