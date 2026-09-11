package expo.modules.screentranslator

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Base64
import android.util.DisplayMetrics
import android.view.WindowManager
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteBuffer

class ScreenCaptureService : Service() {

    companion object {
        const val EXTRA_RESULT_CODE = "resultCode"
        const val EXTRA_RESULT_DATA = "resultData"
        const val CHANNEL_ID = "screen_translator"
        const val NOTIF_ID = 4211
    }

    private var projection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    private var handler: Handler = Handler(Looper.getMainLooper())
    private var running = false
    private var busy = false
    private var intervalMs = 5000L
    private var manual = false
    /** Set when the user swaps language while a translation is in flight. */
    @Volatile private var retranslateQueued = false
    /** Last frame we managed to grab; reused for manual refresh when the screen hasn't changed. */
    private var lastFrameB64: String? = null
    private var width = 720
    private var height = 1280
    private var density = 320

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForegroundNotif()
        val resultCode = intent?.getIntExtra(EXTRA_RESULT_CODE, 0) ?: 0
        val data = intent?.getParcelableExtra<Intent>(EXTRA_RESULT_DATA)
        if (resultCode == 0 || data == null) {
            stopSelf()
            return START_NOT_STICKY
        }

        val mpm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        projection = mpm.getMediaProjection(resultCode, data)

        val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val metrics = DisplayMetrics()
        @Suppress("DEPRECATION")
        wm.defaultDisplay.getRealMetrics(metrics)
        // Downscale for performance & upload size.
        val scale = 0.5f
        width = (metrics.widthPixels * scale).toInt()
        height = (metrics.heightPixels * scale).toInt()
        density = metrics.densityDpi

        imageReader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2)
        virtualDisplay = projection?.createVirtualDisplay(
            "LensTranslate",
            width, height, density,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            imageReader?.surface, null, null
        )

        intervalMs = ScreenTranslatorHolder.pendingIntervalMs
        manual = intervalMs <= 0L

        FloatingOverlayManager.show(
            applicationContext,
            manual = manual,
            onRefresh = { if (running && !busy) captureFrame(force = true) },
            onLangSelected = { lang ->
                ScreenTranslatorHolder.pendingLang = lang.code
                ScreenTranslatorHolder.pendingLangName = lang.name
                // Re-translate the current screen right away in the new language.
                if (running && !busy) captureFrame(force = true) else retranslateQueued = true
            },
            onClose = { stopSelf() },
        )
        running = true
        ScreenTranslatorHolder.isRunning = true
        handler.postDelayed(captureLoop, 800)
        return START_STICKY
    }

    private val captureLoop = object : Runnable {
        override fun run() {
            if (!running) return
            if (!busy) captureFrame(force = manual)
            if (!manual) handler.postDelayed(this, intervalMs)
        }
    }

    /**
     * Grabs the newest frame and ships it for translation. MediaProjection only emits a
     * frame when the screen content changes, so in manual mode (`force`) we fall back to
     * the last captured frame if nothing new is available.
     */
    private fun captureFrame(force: Boolean = false) {
        val reader = imageReader ?: return
        val img: Image? = try { reader.acquireLatestImage() } catch (_: Throwable) { null }
        if (img == null) {
            val cached = lastFrameB64
            if (force && cached != null) {
                busy = true
                FloatingOverlayManager.setStatus(applicationContext, "Translating…")
                Thread { translateAndRender(cached) }.start()
            }
            return
        }
        busy = true
        try {
            val bitmap = imageToBitmap(img)
            img.close()
            val base64 = bitmapToBase64(bitmap)
            bitmap.recycle()
            lastFrameB64 = base64
            if (manual) FloatingOverlayManager.setStatus(applicationContext, "Translating…")
            Thread { translateAndRender(base64) }.start()
        } catch (t: Throwable) {
            busy = false
        }
    }

    private fun imageToBitmap(image: Image): Bitmap {
        val planes = image.planes
        val buffer: ByteBuffer = planes[0].buffer
        val pixelStride = planes[0].pixelStride
        val rowStride = planes[0].rowStride
        val rowPadding = rowStride - pixelStride * image.width
        val bmp = Bitmap.createBitmap(
            image.width + rowPadding / pixelStride,
            image.height,
            Bitmap.Config.ARGB_8888
        )
        bmp.copyPixelsFromBuffer(buffer)
        return Bitmap.createBitmap(bmp, 0, 0, image.width, image.height)
    }

    private fun bitmapToBase64(bmp: Bitmap): String {
        val out = ByteArrayOutputStream()
        // Scale down to max 1024 wide.
        val target = if (bmp.width > 1024) {
            val ratio = 1024f / bmp.width
            Bitmap.createScaledBitmap(bmp, 1024, (bmp.height * ratio).toInt(), true)
        } else bmp
        target.compress(Bitmap.CompressFormat.JPEG, 65, out)
        if (target !== bmp) target.recycle()
        return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    }

    private fun translateAndRender(b64: String) {
        val backend = ScreenTranslatorHolder.pendingBackend.trimEnd('/')
        val lang = ScreenTranslatorHolder.pendingLang
        val langName = ScreenTranslatorHolder.pendingLangName
        try {
            val url = URL("$backend/api/translate")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json")
            conn.doOutput = true
            conn.connectTimeout = 15000
            conn.readTimeout = 30000
            val body = JSONObject()
                .put("image_base64", b64)
                .put("target_lang", lang)
                .put("target_lang_name", langName)
                .toString()
            conn.outputStream.use { it.write(body.toByteArray()) }
            val code = conn.responseCode
            if (code == 200) {
                val txt = conn.inputStream.bufferedReader().readText()
                val json = JSONObject(txt)
                val blocks = json.optJSONArray("blocks") ?: JSONArray()
                val list = mutableListOf<FloatingOverlayManager.OverlayBlock>()
                for (i in 0 until blocks.length()) {
                    val b = blocks.getJSONObject(i)
                    list.add(
                        FloatingOverlayManager.OverlayBlock(
                            translated = b.optString("translated"),
                            x = b.optDouble("x", 0.0).toFloat(),
                            y = b.optDouble("y", 0.0).toFloat(),
                            w = b.optDouble("width", 0.0).toFloat(),
                            h = b.optDouble("height", 0.0).toFloat(),
                        )
                    )
                }
                val detected = json.optString("detected_language", "")
                handler.post {
                    FloatingOverlayManager.updateBlocks(applicationContext, list, detected)
                }
            } else {
                handler.post { FloatingOverlayManager.setStatus(applicationContext, "") }
            }
            conn.disconnect()
        } catch (_: Throwable) {
            handler.post { FloatingOverlayManager.setStatus(applicationContext, "") }
        } finally {
            busy = false
            if (retranslateQueued) {
                retranslateQueued = false
                handler.post { if (running) captureFrame(force = true) }
            }
        }
    }

    private fun startForegroundNotif() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(CHANNEL_ID, "Screen Translator", NotificationManager.IMPORTANCE_LOW)
            nm.createNotificationChannel(ch)
        }
        val notif: Notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
                .setContentTitle("LensTranslate")
                .setContentText("Translating your screen")
                .setSmallIcon(android.R.drawable.ic_menu_view)
                .setOngoing(true)
                .build()
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
                .setContentTitle("LensTranslate")
                .setContentText("Translating your screen")
                .setSmallIcon(android.R.drawable.ic_menu_view)
                .setOngoing(true)
                .build()
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notif, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        } else {
            startForeground(NOTIF_ID, notif)
        }
    }

    override fun onDestroy() {
        running = false
        ScreenTranslatorHolder.isRunning = false
        handler.removeCallbacksAndMessages(null)
        try { virtualDisplay?.release() } catch (_: Throwable) {}
        try { imageReader?.close() } catch (_: Throwable) {}
        try { projection?.stop() } catch (_: Throwable) {}
        FloatingOverlayManager.dismiss(applicationContext)
        super.onDestroy()
    }
}
