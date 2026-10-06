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
  val status: String = "unpaid",
  val notes: String = "",
  @SerializedName("created_by") val createdBy: String = "",
  @SerializedName("created_at") val createdAt: String = ""
)

data class InvoiceItem(
  val id: Long = 0,
  @SerializedName("invoice_id") val invoiceId: Long = 0,
  val name: String = "",
  val cost: Long = 0,
  val qty: Long = 1
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