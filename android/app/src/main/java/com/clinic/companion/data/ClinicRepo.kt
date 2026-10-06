package com.clinic.companion.data

import com.google.gson.reflect.TypeToken
import org.bouncycastle.crypto.generators.SCrypt
import java.net.URLEncoder
import java.security.SecureRandom
import kotlin.math.round

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
    prefs.setSession(a.token ?: "", a.refreshToken ?: "")
    prefs.setEmail(email)
  }

  /** يجدد الجلسة المحفوظة عند التشغيل حتى لا يُطلب الدخول مجدداً. */
  suspend fun ensureSession(): Boolean {
    if (!prefs.loggedIn()) return false
    val rt = prefs.refreshToken()
    if (rt.isBlank()) return true
    return try {
      val a = SupabaseApi(prefs.baseUrl(), prefs.anonKey())
      a.refresh(rt)
      prefs.setSession(a.token ?: "", a.refreshToken ?: rt)
      true
    } catch (_: Exception) {
      false
    }
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

  suspend fun addPatientMedication(body: Map<String, Any?>) = api().insert("patient_medications", body)
  suspend fun updatePatientMedication(id: Long, body: Map<String, Any?>) =
    api().update("patient_medications", "id=eq.$id", body)
  suspend fun deletePatientMedication(id: Long) = api().delete("patient_medications", "id=eq.$id")

  // ---- إعدادات وعملة ----
  suspend fun settingsMap(): Map<String, String> {
    val rows = decodeList<Map<String, String>>(api().get("settings?select=key,value"))
    return rows.associate { (it["key"] ?: "") to (it["value"] ?: "") }
  }

  suspend fun usdRate(): Double = settingsMap()["usd_rate"]?.toDoubleOrNull() ?: 130.0

  suspend fun saveSettings(values: Map<String, String>) {
    val arr = values.map { mapOf("key" to it.key, "value" to it.value) }
    api().upsert("settings", SupabaseApi.encode(arr))
  }

  // ---- الكتالوج (الخدمات) ----
  suspend fun listCatalog(): List<CatalogItem> {
    val items = decodeList<CatalogItem>(api().get("catalog?select=*&order=name.asc"))
    return items.map { it.copy(materials = catalogMaterials(it.id)) }
  }

  suspend fun catalogMaterials(catalogId: Long): List<CatalogMaterial> {
    val links = decodeList<CatalogMaterial>(
      api().get("catalog_materials?select=material_id,qty&catalog_id=eq.$catalogId")
    )
    if (links.isEmpty()) return emptyList()
    val mats = decodeList<Material>(api().get("materials?select=id,name,unit"))
    val byId = mats.associateBy { it.id }
    return links.map { it.copy(name = byId[it.materialId]?.name ?: "", unit = byId[it.materialId]?.unit ?: "") }
  }

  suspend fun createCatalog(name: String, price: Long, cost: Long, description: String, materials: List<Pair<Long, Double>>) {
    val rate = usdRate()
    val created = decodeList<CatalogItem>(
      api().insert(
        "catalog",
        mapOf(
          "name" to name, "price" to price, "cost" to cost, "description" to description,
          "price_usd" to usd(price, rate), "cost_usd" to usd(cost, rate)
        )
      )
    ).first()
    materials.forEach { (mid, q) ->
      api().insert("catalog_materials", mapOf("catalog_id" to created.id, "material_id" to mid, "qty" to q))
    }
  }

  suspend fun updateCatalog(id: Long, name: String, price: Long, cost: Long, description: String, materials: List<Pair<Long, Double>>) {
    val rate = usdRate()
    api().update(
      "catalog", "id=eq.$id",
      mapOf(
        "name" to name, "price" to price, "cost" to cost, "description" to description,
        "price_usd" to usd(price, rate), "cost_usd" to usd(cost, rate)
      )
    )
    api().delete("catalog_materials", "catalog_id=eq.$id")
    materials.forEach { (mid, q) ->
      api().insert("catalog_materials", mapOf("catalog_id" to id, "material_id" to mid, "qty" to q))
    }
  }

  suspend fun deleteCatalog(id: Long) {
    api().delete("catalog_materials", "catalog_id=eq.$id")
    api().delete("catalog", "id=eq.$id")
  }

  // ---- المخزون ----
  suspend fun listMaterials(): List<Material> =
    decodeList(api().get("materials?select=*&order=name.asc"))

  suspend fun createMaterial(
    name: String, category: String, unit: String, quantity: Double,
    minQty: Double, cost: Long, supplier: String, notes: String
  ) {
    val rate = usdRate()
    api().insert(
      "materials",
      mapOf(
        "name" to name, "category" to category, "unit" to unit, "quantity" to quantity,
        "min_qty" to minQty, "cost" to cost, "cost_usd" to usd(cost, rate),
        "supplier" to supplier, "notes" to notes
      )
    )
  }

  suspend fun updateMaterial(
    id: Long, name: String, category: String, unit: String, quantity: Double,
    minQty: Double, cost: Long, supplier: String, notes: String
  ) {
    val rate = usdRate()
    api().update(
      "materials", "id=eq.$id",
      mapOf(
        "name" to name, "category" to category, "unit" to unit, "quantity" to quantity,
        "min_qty" to minQty, "cost" to cost, "cost_usd" to usd(cost, rate),
        "supplier" to supplier, "notes" to notes
      )
    )
  }

  suspend fun deleteMaterial(id: Long) = api().delete("materials", "id=eq.$id")

  suspend fun adjustStock(
    materialId: Long, delta: Double, operation: String,
    reference: String, userName: String, note: String
  ) {
    val m = decodeList<Material>(api().get("materials?select=*&id=eq.$materialId&limit=1")).firstOrNull() ?: return
    api().update("materials", "id=eq.$materialId", mapOf("quantity" to (m.quantity + delta)))
    api().insert(
      "stock_movements",
      mapOf(
        "material_id" to materialId, "qty" to delta, "operation" to operation,
        "reference" to reference, "user_name" to userName, "note" to note
      )
    )
  }

  suspend fun listStockMovements(): List<StockMovement> {
    val rows = decodeList<StockMovement>(api().get("stock_movements?select=*&order=id.desc&limit=200"))
    if (rows.isEmpty()) return emptyList()
    val mats = decodeList<Material>(api().get("materials?select=id,name")).associateBy { it.id }
    return rows.map { it.copy(materialName = mats[it.materialId]?.name) }
  }

  // ---- المصاريف ----
  suspend fun listExpenses(): List<Expense> =
    decodeList(api().get("expenses?select=*&order=date.desc,id.desc&limit=500"))

  suspend fun createExpense(
    category: String, amount: Long, date: String, note: String,
    createdBy: String, recurring: Boolean, recurrence: String
  ) {
    val rate = usdRate()
    api().insert(
      "expenses",
      mapOf(
        "category" to category, "amount" to amount, "amount_usd" to usd(amount, rate),
        "date" to date, "note" to note, "created_by" to createdBy,
        "is_recurring" to (if (recurring) 1 else 0), "recurrence" to recurrence,
        "next_due" to (if (recurring) nextDue(date, recurrence) else "")
      )
    )
  }

  suspend fun updateExpense(
    id: Long, category: String, amount: Long, date: String, note: String,
    recurring: Boolean, recurrence: String
  ) {
    val rate = usdRate()
    api().update(
      "expenses", "id=eq.$id",
      mapOf(
        "category" to category, "amount" to amount, "amount_usd" to usd(amount, rate),
        "date" to date, "note" to note,
        "is_recurring" to (if (recurring) 1 else 0), "recurrence" to recurrence,
        "next_due" to (if (recurring) nextDue(date, recurrence) else "")
      )
    )
  }

  suspend fun deleteExpense(id: Long) = api().delete("expenses", "id=eq.$id")

  private fun nextDue(date: String, recurrence: String): String {
    val parts = date.split("-").mapNotNull { it.toIntOrNull() }
    if (parts.size != 3) return ""
    val cal = java.util.Calendar.getInstance()
    cal.set(parts[0], parts[1] - 1, parts[2])
    when (recurrence) {
      "weekly" -> cal.add(java.util.Calendar.DAY_OF_MONTH, 7)
      "yearly" -> cal.add(java.util.Calendar.YEAR, 1)
      "quarterly" -> cal.add(java.util.Calendar.MONTH, 3)
      else -> cal.add(java.util.Calendar.MONTH, 1)
    }
    return "%04d-%02d-%02d".format(
      cal.get(java.util.Calendar.YEAR), cal.get(java.util.Calendar.MONTH) + 1, cal.get(java.util.Calendar.DAY_OF_MONTH)
    )
  }

  // ---- الفواتير ----
  suspend fun nextInvoiceNo(): String {
    val rows = decodeList<Invoice>(api().get("invoices?select=invoice_no&order=id.desc&limit=1"))
    val last = rows.firstOrNull()?.invoiceNo ?: "0"
    return "%04d".format((last.toIntOrNull() ?: 0) + 1)
  }

  suspend fun invoiceWithItems(id: Long): Invoice? {
    val inv = decodeList<Invoice>(api().get("invoices?select=*&id=eq.$id&limit=1")).firstOrNull() ?: return null
    val items = invoiceItems(id)
    return inv.copy(items = items)
  }

  suspend fun createInvoice(
    patientId: Long, date: String, usdRate: Double, discount: Long,
    notes: String, items: List<DraftItem>, userName: String
  ): Invoice {
    val invoiceNo = nextInvoiceNo()
    val subtotal = items.sumOf { it.cost * it.qty }
    val total = maxOf(0L, subtotal - discount)
    val created = decodeList<Invoice>(
      api().insert(
        "invoices",
        mapOf(
          "invoice_no" to invoiceNo, "patient_id" to patientId, "date" to date, "usd_rate" to usdRate,
          "subtotal" to subtotal, "discount" to discount, "total" to total, "paid" to 0L,
          "subtotal_usd" to usd(subtotal, usdRate), "discount_usd" to usd(discount, usdRate),
          "total_usd" to usd(total, usdRate), "paid_usd" to 0.0, "status" to "unpaid",
          "notes" to notes, "created_by" to userName
        )
      )
    ).first()

    items.forEach { item ->
      val createdItem = decodeList<InvoiceItem>(
        api().insert(
          "invoice_items",
          mapOf(
            "invoice_id" to created.id, "name" to item.name, "cost" to item.cost,
            "qty" to item.qty, "cost_usd" to usd(item.cost, usdRate), "catalog_id" to item.catalogId
          )
        )
      ).first()
      if (item.catalogId != null) {
        val mats = decodeList<CatalogMaterial>(
          api().get("catalog_materials?select=material_id,qty&catalog_id=eq.${item.catalogId}")
        )
        mats.forEach { cm ->
          api().insert(
            "invoice_materials",
            mapOf("invoice_id" to created.id, "item_id" to createdItem.id, "material_id" to cm.materialId, "qty" to cm.qty)
          )
          adjustStock(cm.materialId, -cm.qty, "sale", invoiceNo, userName, item.name)
        }
      }
    }
    return created
  }

  suspend fun addPayment(id: Long, amount: Long) {
    val inv = decodeList<Invoice>(api().get("invoices?select=*&id=eq.$id&limit=1")).firstOrNull() ?: return
    val paid = inv.paid + amount
    val status = when {
      paid >= inv.total -> "paid"
      paid > 0 -> "partial"
      else -> "unpaid"
    }
    api().update("invoices", "id=eq.$id", mapOf("paid" to paid, "status" to status, "paid_usd" to usd(paid, inv.usdRate)))
  }

  suspend fun deleteInvoice(id: Long) {
    api().delete("invoice_materials", "invoice_id=eq.$id")
    api().delete("invoice_items", "invoice_id=eq.$id")
    api().delete("invoices", "id=eq.$id")
  }

  // ---- المستخدمون ----
  suspend fun listUsers(): List<AppUser> =
    decodeList(api().get("users?select=id,username,role,full_name,created_at&order=id"))

  suspend fun createUser(username: String, password: String, role: String, fullName: String) {
    api().insert(
      "users",
      mapOf("username" to username, "password_hash" to hashPassword(password), "role" to role, "full_name" to fullName)
    )
  }

  suspend fun updateUser(id: Long, username: String, role: String, fullName: String, password: String?) {
    val body = mutableMapOf<String, Any?>("username" to username, "role" to role, "full_name" to fullName)
    if (!password.isNullOrBlank()) body["password_hash"] = hashPassword(password)
    api().update("users", "id=eq.$id", body)
  }

  suspend fun deleteUser(id: Long) = api().delete("users", "id=eq.$id")

  private fun hashPassword(password: String): String {
    val salt = ByteArray(16)
    SecureRandom().nextBytes(salt)
    val saltHex = salt.joinToString("") { "%02x".format(it) }
    val hash = SCrypt.generate(
      password.toByteArray(Charsets.UTF_8), saltHex.toByteArray(Charsets.UTF_8), 16384, 8, 1, 32
    )
    val hashHex = hash.joinToString("") { "%02x".format(it) }
    return "s1\$$saltHex\$$hashHex"
  }

  private fun usd(n: Long, rate: Double): Double =
    if (rate > 0) round(n / rate * 100) / 100 else 0.0
}