# إبقاء أسماء الفئات المستخدمة مع Gson
-keep class com.clinic.companion.data.model.** { *; }
-keepattributes Signature
-keepattributes *Annotation*
-dontwarn okhttp3.**
-dontwarn okio.**