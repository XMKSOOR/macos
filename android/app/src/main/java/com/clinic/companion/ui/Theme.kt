package com.clinic.companion.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.Typography
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Colors = lightColorScheme(
  primary = Color(0xFF0F766E),
  onPrimary = Color.White,
  primaryContainer = Color(0xFFB2DFDB),
  onPrimaryContainer = Color(0xFF00201C),
  secondary = Color(0xFF00695C),
  surface = Color(0xFFF6F7F9),
  background = Color(0xFFEEF1F4),
  surfaceVariant = Color(0xFFE3E8EC),
  error = Color(0xFFB3261E)
)

@Composable
fun AppTheme(content: @Composable () -> Unit) {
  MaterialTheme(colorScheme = Colors, typography = Typography(), content = content)
}