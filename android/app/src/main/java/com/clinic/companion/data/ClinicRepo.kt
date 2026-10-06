package com.clinic.companion.data

import com.google.gson.reflect.TypeToken
import java.net.URLEncoder

class ClinicRepo(private val prefs: Prefs) {

  private fun api(): SupabaseApi = SupabaseApi(
    baseUrl = prefs.baseUrl(),
    anonKey = prefs.anonKey(),
    token = prefs.token().ifBlank { null }
  )

  private inline fun <reified T> decodeList(text: String): List<T> =
    SupabaseApi.decode(text, object : TypeToken<List<T>>() {}.type)

  suspend fun login(email: String, password: String) {
    val a = SupabaseApi(prefs.baseUrl(), prefs.anonKey())
    a.login(email, password)
    prefs.setToken(a.token ?: "")
    prefs.setEmail(email)
  }

  fun logout() = prefs.clearSession()

  suspend fun testConnection() {
    api().ping()
  }

  // ---- المرضى ----
  suspend fun listPatients(search: String): List<Patient> {
    var q = "patients?select=*&order=name.asc"
    val s = search.trim()
    if (s.isNotEmpty()) {
      val enc = URLEncoder.encode(s, "UTF-8")
      q += "&or=(name.ilike.*$enc*,phone.ilike.*$enc*)"
    }
    return decodeList(api().get(q))
  }

  suspend fun getPatient(id: Long): Patient? =
    decodeList<Patient>(api().get("patients?select=*&id=eq.$id&limit=1")).firstOrNull()

  suspend fun addPatient(body: Map<String, Any?>): Patient =
    decodeList<Patient>(api().insert("patients", body)).firstOrNull()
      ?: throw Exception("لم يُعد الخادم المريض الجديد")

  suspend fun updatePatient(id: Long, obj: Any) = api().update("patients", "id=eq.$id", obj)

  // ---- المواعيد ----
  suspend fun appointments(): List<Appointment> =
    decodeList(api().get("appointments?select=*&order=date.desc,time.desc"))

  suspend fun upcoming(fromDate: String): List<Appointment> =
    decodeList(api().get("appointments?select=*&date=gte.$fromDate&order=date.asc,time.asc"))

  suspend fun patientAppointments(patientId: Long): List<Appointment> =
    decodeList(api().get("appointments?select=*&patient_id=eq.$patientId&order=date.desc,time.desc"))

  suspend fun addAppointment(obj: Any) = api().insert("appointments", obj)

  suspend fun updateAppointment(id: Long, obj: Any) = api().update("appointments", "id=eq.$id", obj)

  // ---- الفواتير ----
  suspend fun invoices(): List<Invoice> =
    decodeList(api().get("invoices?select=*&order=id.desc"))

  suspend fun patientInvoices(patientId: Long): List<Invoice> =
    decodeList(api().get("invoices?select=*&patient_id=eq.$patientId&order=id.desc"))

  suspend fun invoiceItems(invoiceId: Long): List<InvoiceItem> =
    decodeList(api().get("invoice_items?select=*&invoice_id=eq.$invoiceId&order=id.asc"))

  // ---- الأدوية ----
  suspend fun patientMedications(patientId: Long): List<PatientMedication> =
    decodeList(api().get("patient_medications?select=*&patient_id=eq.$patientId&order=id.desc"))

  suspend fun medicines(): List<Medicine> =
    decodeList(api().get("medicines?select=*&order=trade_name.asc"))
}