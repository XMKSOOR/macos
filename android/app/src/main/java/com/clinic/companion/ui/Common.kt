package com.clinic.companion.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.util.Calendar

val LocalCurrencyScale = staticCompositionLocalOf { 100 }

fun formatMoney(v: Long): String {
  val scale = 100
  return if (v % scale == 0L) "%,d".format(v / scale) else "%,.2f".format(v.toDouble() / scale)
}

fun today(): String {
  val c = Calendar.getInstance()
  return "%04d-%02d-%02d".format(c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH))
}

@Composable
fun LoadingBox(modifier: Modifier = Modifier) {
  Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
    CircularProgressIndicator()
  }
}

@Composable
fun ErrorPane(message: String, onRetry: (() -> Unit)? = null, modifier: Modifier = Modifier) {
  Box(modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
      Text(message, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyLarge)
      if (onRetry != null) TextButton(onClick = onRetry) { Text("إعادة المحاولة") }
    }
  }
}

@Composable
fun EmptyBox(text: String, modifier: Modifier = Modifier) {
  Box(modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
    Text(text, color = MaterialTheme.colorScheme.onSurfaceVariant)
  }
}

@Composable
fun SectionCard(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
  Card(
    modifier = modifier.fillMaxWidth(),
    shape = RoundedCornerShape(16.dp),
    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
  ) {
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { content() }
  }
}

@Composable
fun InfoRow(label: String, value: String?) {
  if (value.isNullOrBlank()) return
  Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
    Text(label, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    Text(value, modifier = Modifier.fillMaxWidth(0.65f), textAlign = androidx.compose.ui.text.style.TextAlign.End)
  }
}

@Composable
fun LabeledField(
  label: String,
  value: String,
  onValueChange: (String) -> Unit,
  modifier: Modifier = Modifier,
  singleLine: Boolean = true,
  minLines: Int = 1
) {
  OutlinedTextField(
    value = value,
    onValueChange = onValueChange,
    label = { Text(label) },
    singleLine = singleLine,
    minLines = minLines,
    modifier = modifier.fillMaxWidth()
  )
}