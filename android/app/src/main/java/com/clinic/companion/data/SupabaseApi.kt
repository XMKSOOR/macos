package com.clinic.companion.data

import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.util.concurrent.TimeUnit

class SupabaseApi(
  private val baseUrl: String,
  private val anonKey: String,
  var token: String? = null
) {
  companion object {
    private val JSON = "application/json; charset=utf-8".toMediaType()
    val client: OkHttpClient = OkHttpClient.Builder()
      .connectTimeout(20, TimeUnit.SECONDS)
      .readTimeout(40, TimeUnit.SECONDS)
      .writeTimeout(40, TimeUnit.SECONDS)
      .build()
    private val gson = Gson()

    @JvmStatic
    fun <T> decode(text: String, type: java.lang.reflect.Type): T = gson.fromJson(text, type)

    @JvmStatic
    fun encode(obj: Any): String = gson.toJson(obj)
  }

  private fun base(): String = baseUrl.trim().trimEnd('/')
  private fun url(path: String) = base() + path

  private fun Request.Builder.auth(): Request.Builder {
    header("apikey", anonKey)
    token?.takeIf { it.isNotBlank() }?.let { header("Authorization", "Bearer $it") }
    return this
  }

  private suspend fun execute(req: Request): String = withContext(Dispatchers.IO) {
    client.newCall(req).execute().use { resp: Response ->
      val text = resp.body?.string() ?: ""
      if (!resp.isSuccessful) throw Exception(parseError(text, resp.code))
      text
    }
  }

  private fun parseError(text: String, code: Int): String {
    return try {
      @Suppress("UNCHECKED_CAST")
      val map = gson.fromJson(text, Map::class.java) as Map<String, Any?>
      (map["msg"] ?: map["error_description"] ?: map["message"] ?: map["error"])?.toString()
        ?: "خطأ $code"
    } catch (_: Exception) {
      if (text.isBlank()) "خطأ HTTP $code" else text.take(200)
    }
  }

  suspend fun login(email: String, password: String) {
    val body = gson.toJson(mapOf("email" to email, "password" to password)).toRequestBody(JSON)
    val req = Request.Builder()
      .url(url("/auth/v1/token?grant_type=password"))
      .post(body)
      .header("apikey", anonKey)
      .header("Content-Type", "application/json")
      .build()
    val text = execute(req)
    @Suppress("UNCHECKED_CAST")
    val map = gson.fromJson(text, Map::class.java) as Map<String, Any?>
    token = map["access_token"]?.toString()
      ?: throw Exception("لم يُعد الخادم رمز دخول")
  }

  suspend fun get(path: String): String {
    val req = Request.Builder().url(url("/rest/v1/$path")).get().auth().build()
    return execute(req)
  }

  suspend fun insert(table: String, json: String): String {
    val req = Request.Builder()
      .url(url("/rest/v1/$table"))
      .post(json.toRequestBody(JSON))
      .auth()
      .header("Prefer", "return=representation")
      .build()
    return execute(req)
  }

  suspend fun insert(table: String, obj: Any): String = insert(table, gson.toJson(obj))

  suspend fun update(table: String, filter: String, obj: Any): String {
    val req = Request.Builder()
      .url(url("/rest/v1/$table?$filter"))
      .patch(gson.toJson(obj).toRequestBody(JSON))
      .auth()
      .header("Prefer", "return=representation")
      .build()
    return execute(req)
  }

  suspend fun delete(table: String, filter: String) {
    val req = Request.Builder()
      .url(url("/rest/v1/$table?$filter"))
      .delete()
      .auth()
      .build()
    execute(req)
  }

  fun <T> parse(text: String, type: java.lang.reflect.Type): T = gson.fromJson(text, type)

  fun parseList(text: String): List<Map<String, Any?>> {
    val t = object : TypeToken<List<Map<String, Any?>>>() {}.type
    return gson.fromJson(text, t) ?: emptyList()
  }

  suspend fun ping() {
    get("patients?select=id&limit=1")
  }
}