package com.clinic.companion

import android.app.Application
import com.clinic.companion.data.ClinicRepo
import com.clinic.companion.data.Prefs

class ClinicApp : Application() {
  lateinit var prefs: Prefs
  lateinit var repo: ClinicRepo

  override fun onCreate() {
    super.onCreate()
    prefs = Prefs(this)
    repo = ClinicRepo(prefs)
  }
}