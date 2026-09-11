package expo.modules.screentranslator

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val REQ_CAPTURE = 34110

class ScreenTranslatorModule : Module() {

    private var startPromise: Promise? = null

    override fun definition() = ModuleDefinition {
        Name("ScreenTranslator")

        Constants("isAndroid" to true)

        AsyncFunction("hasOverlayPermission") {
            val ctx = appContext.reactContext ?: return@AsyncFunction false
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) Settings.canDrawOverlays(ctx) else true
        }

        AsyncFunction("requestOverlayPermission") { promise: Promise ->
            val ctx = appContext.reactContext
            if (ctx == null) { promise.resolve(false); return@AsyncFunction }
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(ctx)) {
                promise.resolve(true); return@AsyncFunction
            }
            val i = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${ctx.packageName}"))
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ctx.startActivity(i)
            promise.resolve(false)
        }

        AsyncFunction("startCapture") { options: Map<String, Any?>, promise: Promise ->
            val ctx = appContext.reactContext
            val activity: Activity? = appContext.activityProvider?.currentActivity
            if (ctx == null || activity == null) {
                promise.reject("NO_ACTIVITY", "Activity unavailable", null); return@AsyncFunction
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(ctx)) {
                promise.reject("NO_OVERLAY", "Overlay permission not granted", null); return@AsyncFunction
            }
            ScreenTranslatorHolder.pendingLang = options["targetLang"] as? String ?: "en"
            ScreenTranslatorHolder.pendingLangName = options["targetLangName"] as? String ?: "English"
            ScreenTranslatorHolder.pendingBackend = options["backendUrl"] as? String ?: ""
            ScreenTranslatorHolder.pendingIntervalMs = (options["intervalMs"] as? Number)?.toLong() ?: 5000L
            ScreenTranslatorHolder.textSizeSp = (options["textSizeSp"] as? Number)?.toFloat() ?: 14f
            ScreenTranslatorHolder.opacity = ((options["opacity"] as? Number)?.toFloat() ?: 0.92f).coerceIn(0.4f, 1f)
            @Suppress("UNCHECKED_CAST")
            val favs = options["favorites"] as? List<Map<String, Any?>> ?: emptyList()
            ScreenTranslatorHolder.favorites = favs.mapNotNull { f ->
                val code = f["code"] as? String ?: return@mapNotNull null
                val name = f["name"] as? String ?: return@mapNotNull null
                ScreenTranslatorHolder.Lang(code, name)
            }
            startPromise = promise

            val mpm = ctx.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            activity.startActivityForResult(mpm.createScreenCaptureIntent(), REQ_CAPTURE)
        }

        AsyncFunction("stopCapture") {
            val ctx = appContext.reactContext ?: return@AsyncFunction false
            val intent = Intent(ctx, ScreenCaptureService::class.java)
            ctx.stopService(intent)
            FloatingOverlayManager.dismiss(ctx)
            true
        }

        AsyncFunction("getActiveTarget") {
            if (!ScreenTranslatorHolder.isRunning) return@AsyncFunction null
            mapOf(
                "code" to ScreenTranslatorHolder.pendingLang,
                "name" to ScreenTranslatorHolder.pendingLangName,
            )
        }

        OnActivityResult { _, payload ->
            if (payload.requestCode != REQ_CAPTURE) return@OnActivityResult
            val ctx = appContext.reactContext ?: return@OnActivityResult
            val promise = startPromise
            startPromise = null
            if (payload.resultCode != Activity.RESULT_OK || payload.data == null) {
                promise?.resolve(false)
                return@OnActivityResult
            }
            val svc = Intent(ctx, ScreenCaptureService::class.java).apply {
                putExtra(ScreenCaptureService.EXTRA_RESULT_CODE, payload.resultCode)
                putExtra(ScreenCaptureService.EXTRA_RESULT_DATA, payload.data)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(svc)
            } else {
                ctx.startService(svc)
            }
            promise?.resolve(true)
        }
    }
}
