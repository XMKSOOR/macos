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
  fun refreshToken(): String = sp.getString("refresh", "") ?: ""

  fun setSession(access: String, refresh: String) =
    sp.edit().putString("token", access).putString("refresh", refresh).apply()

  fun email(): String = sp.getString("email", "") ?: ""
  fun setEmail(v: String) = sp.edit().putString("email", v).apply()

  fun ensureDefaults() {
    if (baseUrl().isBlank()) setBaseUrl(AppDefaults.SUPABASE_URL)
    if (anonKey().isBlank()) setAnonKey(AppDefaults.SUPABASE_ANON_KEY)
  }

  fun configured(): Boolean = baseUrl().isNotBlank() && anonKey().isNotBlank()
  fun loggedIn(): Boolean = token().isNotBlank()
  fun clearSession() = sp.edit().remove("token").remove("refresh").apply()
}