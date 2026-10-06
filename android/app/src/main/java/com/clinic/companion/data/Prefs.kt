package com.clinic.companion.data

import android.content.Context
import android.content.SharedPreferences

class Prefs(context: Context) {
  private val sp: SharedPreferences =
    context.applicationContext.getSharedPreferences("clinic", Context.MODE_PRIVATE)

  fun baseUrl(): String = sp.getString("baseUrl", "") ?: ""
  fun setBaseUrl(v: String) = sp.edit().putString("baseUrl", v.trim()).apply()

  fun anonKey(): String = sp.getString("anonKey", "") ?: ""
  fun setAnonKey(v: String) = sp.edit().putString("anonKey", v.trim()).apply()

  fun token(): String = sp.getString("token", "") ?: ""
  fun setToken(v: String) = sp.edit().putString("token", v).apply()

  fun email(): String = sp.getString("email", "") ?: ""
  fun setEmail(v: String) = sp.edit().putString("email", v).apply()

  fun configured(): Boolean = baseUrl().isNotBlank() && anonKey().isNotBlank()
  fun loggedIn(): Boolean = token().isNotBlank()
  fun clearSession() = sp.edit().remove("token").apply()
}