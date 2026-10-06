package com.clinic.companion.data

import com.google.gson.annotations.SerializedName

data class Patient(
  val id: Long = 0,
  val name: String = "",
  val phone: String = "",
  @SerializedName("birth_date") val birthDate: String = "",
  val gender: String = "",
  val address: String = "",
  val notes: String = "",
  @SerializedName("national_id") val nationalId: String = "",
  val allergies: String = "",
  @SerializedName("chronic_diseases") val chronicDiseases: String = "",
  @SerializedName("physiological_status") val physiologicalStatus: String = "",
  @SerializedName("medical_notes") val medicalNotes: String = "",
  @SerializedName("created_at") val createdAt: String = "",
  @SerializedName("updated_at") val updatedAt: String = ""
)

data class Appointment(
  val id: Long = 0,
  @SerializedName("patient_id") val patientId: Long = 0,
  val date: String = "",
  val time: String = "",
  val reason: String = "",
  val notes: String = "",
  val status: String = "scheduled",
  @SerializedName("created_at") val createdAt: String = ""
)

data class Invoice(
  val id: Long = 0,
  @SerializedName("invoice_no") val invoiceNo: String = "",
  @SerializedName("patient_id") val patientId: Long = 0,
  val date: String = "",
  @SerializedName("usd_rate") val usdRate: Double = 0.0,
  val subtotal: Long = 0,
  val discount: Long = 0,
  val total: Long = 0,
  val paid: Long = 0,
  @SerializedName("subtotal_usd") val subtotalUsd: Double = 0.0,
  @SerializedName("discount_usd") val discountUsd: Double = 0.0,
  @SerializedName("total_usd") val totalUsd: Double = 0.0,
  @SerializedName("paid_usd") val paidUsd: Double = 0.0,
  val status: String = "unpaid",
  val notes: String = "",
  @SerializedName("created_by") val createdBy: String = "",
  @SerializedName("created_at") val createdAt: String = "",
  @SerializedName("patient_name") val patientName: String? = null,
  @SerializedName("patient_phone") val patientPhone: String? = null,
  val items: List<InvoiceItem> = emptyList()
)

data class InvoiceItem(
  val id: Long = 0,
  @SerializedName("invoice_id") val invoiceId: Long = 0,
  val name: String = "",
  val cost: Long = 0,
  val qty: Long = 1,
  @SerializedName("catalog_id") val catalogId: Long? = null,
  @SerializedName("cost_usd") val costUsd: Double = 0.0
)

data class CatalogMaterial(
  @SerializedName("material_id") val materialId: Long = 0,
  val qty: Double = 0.0,
  val name: String = "",
  val unit: String = ""
)

data class CatalogItem(
  val id: Long = 0,
  val name: String = "",
  val price: Long = 0,
  val cost: Long = 0,
  @SerializedName("price_usd") val priceUsd: Double = 0.0,
  @SerializedName("cost_usd") val costUsd: Double = 0.0,
  val description: String = "",
  @SerializedName("created_at") val createdAt: String = "",
  val materials: List<CatalogMaterial> = emptyList()
)

data class Material(
  val id: Long = 0,
  val name: String = "",
  val category: String = "",
  val unit: String = "",
  val quantity: Double = 0.0,
  @SerializedName("min_qty") val minQty: Double = 0.0,
  val cost: Long = 0,
  @SerializedName("cost_usd") val costUsd: Double = 0.0,
  val supplier: String = "",
  val notes: String = "",
  @SerializedName("created_at") val createdAt: String = ""
)

data class StockMovement(
  val id: Long = 0,
  @SerializedName("material_id") val materialId: Long = 0,
  val qty: Double = 0.0,
  val operation: String = "",
  val reference: String = "",
  @SerializedName("user_name") val userName: String = "",
  val note: String = "",
  @SerializedName("created_at") val createdAt: String = "",
  @SerializedName("material_name") val materialName: String? = null
)

data class Expense(
  val id: Long = 0,
  val category: String = "",
  val amount: Long = 0,
  @SerializedName("amount_usd") val amountUsd: Double = 0.0,
  val note: String = "",
  val date: String = "",
  @SerializedName("created_by") val createdBy: String = "",
  @SerializedName("created_at") val createdAt: String = "",
  @SerializedName("is_recurring") val isRecurring: Int = 0,
  val recurrence: String = "monthly",
  @SerializedName("next_due") val nextDue: String = ""
)

data class AppUser(
  val id: Long = 0,
  val username: String = "",
  val role: String = "cashier",
  @SerializedName("full_name") val fullName: String = "",
  @SerializedName("created_at") val createdAt: String = ""
)

data class DraftItem(
  var name: String = "",
  var cost: Long = 0,
  var qty: Long = 1,
  var catalogId: Long? = null
)

data class PatientMedication(
  val id: Long = 0,
  @SerializedName("patient_id") val patientId: Long = 0,
  @SerializedName("scientific_name") val scientificName: String = "",
  @SerializedName("trade_name") val tradeName: String = "",
  val dose: String = "",
  val form: String = "",
  val route: String = "",
  val frequency: String = "",
  @SerializedName("start_date") val startDate: String = "",
  @SerializedName("end_date") val endDate: String = "",
  val category: String = "prescription",
  val prescriber: String = "",
  @SerializedName("prescriber_specialty") val prescriberSpecialty: String = "",
  val pharmacist: String = "",
  @SerializedName("dispense_date") val dispenseDate: String = "",
  @SerializedName("dispense_place") val dispensePlace: String = "",
  @SerializedName("next_review") val nextReview: String = "",
  val notes: String = "",
  val active: Int = 1,
  @SerializedName("created_at") val createdAt: String = ""
)

data class Medicine(
  val id: Long = 0,
  @SerializedName("trade_name") val tradeName: String = "",
  @SerializedName("scientific_name") val scientificName: String = "",
  val dose: String = "",
  val form: String = "",
  val route: String = "",
  val frequency: String = "",
  val category: String = "prescription"
)