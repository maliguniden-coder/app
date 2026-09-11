package expo.modules.screentranslator

import androidx.activity.result.ActivityResultLauncher

/** Shared state between the JS module, the capture service and the overlay. */
object ScreenTranslatorHolder {
    data class Lang(val code: String, val name: String)

    @Volatile var pendingLang: String = "en"
    @Volatile var pendingLangName: String = "English"
    var pendingBackend: String = ""
    /** 0 = manual refresh mode. */
    var pendingIntervalMs: Long = 5000L
    var textSizeSp: Float = 14f
    /** Panel background opacity 0.4–1. */
    var opacity: Float = 0.92f
    /** Favorite languages shown as quick-swap chips on the overlay. */
    var favorites: List<Lang> = emptyList()
    /** Auto-stop delay in ms; 0 = never. */
    var autoStopMs: Long = 0L
    /** True while the capture service is alive. */
    @Volatile var isRunning: Boolean = false
    var launcher: ActivityResultLauncher<Unit>? = null
}
