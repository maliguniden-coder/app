package expo.modules.screentranslator

import androidx.activity.result.ActivityResultLauncher

// Kept for backwards compatibility with older references.
object ScreenTranslatorHolder {
    var pendingLang: String = "en"
    var pendingLangName: String = "English"
    var pendingBackend: String = ""
    var launcher: ActivityResultLauncher<Unit>? = null
}
