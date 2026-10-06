package com.clinic.companion.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.clinic.companion.data.ClinicRepo
import com.clinic.companion.data.Prefs

private enum class Route { Setup, Login, Main }

@Composable
fun AppRoot(prefs: Prefs, repo: ClinicRepo) {
  var route by remember {
    mutableStateOf(
      when {
        !prefs.configured() -> Route.Setup
        !prefs.loggedIn() -> Route.Login
        else -> Route.Main
      }
    )
  }

  when (route) {
    Route.Setup -> SetupScreen(
      initialUrl = prefs.baseUrl(),
      initialKey = prefs.anonKey(),
      prefs = prefs,
      repo = repo,
      onDone = { route = Route.Login }
    )
    Route.Login -> LoginScreen(
      defaultEmail = prefs.email(),
      repo = repo,
      onLoggedIn = { route = Route.Main },
      onChangeServer = { route = Route.Setup }
    )
    Route.Main -> MainScaffold(
      repo = repo,
      email = prefs.email(),
      onLogout = {
        repo.logout()
        route = Route.Login
      },
      onReconfigure = { route = Route.Setup }
    )
  }
}