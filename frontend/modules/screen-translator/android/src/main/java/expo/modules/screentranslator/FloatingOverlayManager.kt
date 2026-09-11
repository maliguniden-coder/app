package expo.modules.screentranslator

import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.util.DisplayMetrics
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Draws a draggable floating panel over other apps. It contains translated text
 * blocks stacked vertically. The panel can be dragged up/down/left/right so the
 * app below stays usable, pinned in place with the lock button, refreshed on
 * demand (manual cadence), and closed to end the session.
 */
object FloatingOverlayManager {

    data class OverlayBlock(
        val translated: String,
        val x: Float,
        val y: Float,
        val w: Float,
        val h: Float,
    )

    private var container: FrameLayout? = null
    private var body: LinearLayout? = null
    private var titleView: TextView? = null
    private var lockView: ImageView? = null
    private var handleView: View? = null
    private var chipsRow: LinearLayout? = null
    private var params: WindowManager.LayoutParams? = null
    private var wm: WindowManager? = null

    private var pinned = false
    private var detectedLang = ""
    private var status = ""
    private var textSizeSp = 14f
    private var opacity = 0.92f
    private var chipLangs: List<ScreenTranslatorHolder.Lang> = emptyList()
    private var chipSelect: ((ScreenTranslatorHolder.Lang) -> Unit)? = null
    private var autoStopMinutes = 0

    private const val PREFS = "lens_translate_overlay"
    private const val KEY_X = "panel_x"
    private const val KEY_Y = "panel_y"

    private val ACCENT = Color.rgb(124, 224, 130)

    fun show(
        ctx: Context,
        manual: Boolean,
        onRefresh: () -> Unit,
        onLangSelected: (ScreenTranslatorHolder.Lang) -> Unit,
        onClose: () -> Unit,
    ) {
        if (container != null) return
        val windowManager = ctx.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        wm = windowManager
        pinned = false
        detectedLang = ""
        status = ""
        textSizeSp = ScreenTranslatorHolder.textSizeSp
        opacity = ScreenTranslatorHolder.opacity

        val dm = DisplayMetrics()
        @Suppress("DEPRECATION")
        windowManager.defaultDisplay.getMetrics(dm)

        val panel = FrameLayout(ctx)
        val bg = GradientDrawable().apply {
            cornerRadius = dp(ctx, 20f)
            setColor(Color.argb((255 * opacity).toInt(), 20, 20, 20))
            setStroke(dp(ctx, 1f).toInt(), Color.argb(120, 180, 220, 180))
        }
        panel.background = bg
        panel.setPadding(dp(ctx, 12f).toInt(), dp(ctx, 10f).toInt(), dp(ctx, 12f).toInt(), dp(ctx, 12f).toInt())

        val col = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
        }

        // Header row: drag handle + title + [refresh] + lock + close.
        val header = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val handle = View(ctx).apply {
            setBackgroundColor(Color.argb(200, 200, 200, 200))
        }
        val handleLp = LinearLayout.LayoutParams(dp(ctx, 40f).toInt(), dp(ctx, 5f).toInt())
        handleLp.marginEnd = dp(ctx, 10f).toInt()
        header.addView(handle, handleLp)
        handleView = handle

        val title = TextView(ctx).apply {
            text = "LensTranslate"
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            maxLines = 1
        }
        header.addView(title, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        titleView = title

        if (manual) {
            val refresh = iconButton(ctx, android.R.drawable.ic_popup_sync, "Refresh translation")
            refresh.setOnClickListener {
                setStatus(ctx, "Capturing…")
                onRefresh()
            }
            header.addView(refresh)
        }

        val lock = iconButton(ctx, android.R.drawable.ic_lock_lock, "Pin overlay")
        lock.alpha = 0.55f
        lock.setOnClickListener {
            pinned = !pinned
            applyPinnedStyle()
            renderTitle()
        }
        header.addView(lock)
        lockView = lock

        val close = TextView(ctx).apply {
            text = "✕"
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            gravity = Gravity.CENTER
            minWidth = dp(ctx, 40f).toInt()
            minHeight = dp(ctx, 40f).toInt()
            contentDescription = "Stop translation"
        }
        close.setOnClickListener {
            dismiss(ctx)
            onClose()
        }
        header.addView(close)

        col.addView(header)

        // Quick language swap chips (favorites + current target).
        val chips = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val scroller = HorizontalScrollView(ctx).apply {
            isHorizontalScrollBarEnabled = false
            addView(chips)
        }
        chipsRow = chips
        chipLangs = buildChipLangs()
        chipSelect = { lang ->
            onLangSelected(lang)
            setStatus(ctx, "Translating…")
        }
        if (chipLangs.size > 1) {
            val scrollLp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            scrollLp.topMargin = dp(ctx, 8f).toInt()
            col.addView(scroller, scrollLp)
            renderChips(ctx)
        }

        val body = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, dp(ctx, 8f).toInt(), 0, 0)
        }
        col.addView(body)
        this.body = body

        panel.addView(col)
        container = panel

        val overlayType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE

        val lp = WindowManager.LayoutParams(
            (dm.widthPixels * 0.75).toInt(),
            WindowManager.LayoutParams.WRAP_CONTENT,
            overlayType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
            WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        )
        lp.gravity = Gravity.TOP or Gravity.START
        // Restore where the user left the panel last session (clamped to the screen).
        val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val defaultX = dp(ctx, 16f).toInt()
        val defaultY = dp(ctx, 80f).toInt()
        val savedX = prefs.getInt(KEY_X, defaultX)
        val savedY = prefs.getInt(KEY_Y, defaultY)
        lp.x = savedX.coerceIn(0, (dm.widthPixels - lp.width).coerceAtLeast(0))
        lp.y = savedY.coerceIn(0, (dm.heightPixels - dp(ctx, 120f).toInt()).coerceAtLeast(0))
        params = lp

        // Drag anywhere on the header — unless the panel is pinned.
        var startX = 0
        var startY = 0
        var startRawX = 0f
        var startRawY = 0f
        header.setOnTouchListener { _, ev ->
            if (pinned) return@setOnTouchListener false
            when (ev.action) {
                MotionEvent.ACTION_DOWN -> {
                    startX = lp.x
                    startY = lp.y
                    startRawX = ev.rawX
                    startRawY = ev.rawY
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    lp.x = (startX + (ev.rawX - startRawX)).toInt()
                    lp.y = (startY + (ev.rawY - startRawY)).toInt()
                    windowManager.updateViewLayout(panel, lp)
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    if (lp.x != startX || lp.y != startY) {
                        prefs.edit().putInt(KEY_X, lp.x).putInt(KEY_Y, lp.y).apply()
                    }
                    false
                }
                else -> false
            }
        }

        windowManager.addView(panel, lp)
        if (manual) updateBlocks(ctx, emptyList(), "", "Tap ↻ to translate what's on screen")
    }

    fun updateBlocks(ctx: Context, blocks: List<OverlayBlock>, detected: String, emptyText: String = "Scanning for text…") {
        val body = this.body ?: return
        detectedLang = detected
        status = ""
        renderTitle()
        body.removeAllViews()
        if (blocks.none { it.translated.isNotBlank() }) {
            val empty = TextView(ctx).apply {
                text = emptyText
                setTextColor(Color.argb(200, 200, 200, 200))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            }
            body.addView(empty)
            return
        }
        for (b in blocks) {
            if (b.translated.isBlank()) continue
            val tv = TextView(ctx).apply {
                text = b.translated
                setTextColor(Color.WHITE)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, textSizeSp)
                val bg = GradientDrawable().apply {
                    cornerRadius = dp(ctx, 10f)
                    setColor(Color.argb((240 * opacity).toInt(), 40, 66, 40))
                }
                background = bg
                setPadding(dp(ctx, 10f).toInt(), dp(ctx, 6f).toInt(), dp(ctx, 10f).toInt(), dp(ctx, 6f).toInt())
            }
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            lp.topMargin = dp(ctx, 6f).toInt()
            body.addView(tv, lp)
        }
    }

    /** Current target first, then favorites (deduped). */
    private fun buildChipLangs(): List<ScreenTranslatorHolder.Lang> {
        val current = ScreenTranslatorHolder.Lang(
            ScreenTranslatorHolder.pendingLang,
            ScreenTranslatorHolder.pendingLangName,
        )
        val out = mutableListOf(current)
        for (f in ScreenTranslatorHolder.favorites) {
            if (out.none { it.code == f.code }) out.add(f)
        }
        return out
    }

    private fun renderChips(ctx: Context) {
        val row = chipsRow ?: return
        row.removeAllViews()
        val current = ScreenTranslatorHolder.pendingLang
        for (lang in chipLangs) {
            val selected = lang.code == current
            val chip = TextView(ctx).apply {
                text = lang.name
                maxLines = 1
                gravity = Gravity.CENTER
                setTextColor(if (selected) Color.BLACK else Color.WHITE)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
                minHeight = dp(ctx, 32f).toInt()
                background = GradientDrawable().apply {
                    cornerRadius = dp(ctx, 999f)
                    setColor(if (selected) ACCENT else Color.argb(70, 255, 255, 255))
                }
                setPadding(dp(ctx, 12f).toInt(), dp(ctx, 4f).toInt(), dp(ctx, 12f).toInt(), dp(ctx, 4f).toInt())
                contentDescription = "Translate to ${lang.name}"
                setOnClickListener {
                    if (selected) return@setOnClickListener
                    chipSelect?.invoke(lang)
                    renderChips(ctx)
                }
            }
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            lp.marginEnd = dp(ctx, 6f).toInt()
            row.addView(chip, lp)
        }
    }

    /** Short transient status shown in the title (e.g. "Translating…"). Empty clears it. */
    fun setStatus(ctx: Context, text: String) {
        status = text
        renderTitle()
    }

    /** Minutes until the auto-stop timer ends the session; 0 hides the hint. */
    fun setAutoStopMinutes(minutes: Int) {
        autoStopMinutes = minutes
        renderTitle()
    }

    private fun renderTitle() {
        val parts = mutableListOf("LensTranslate")
        if (status.isNotEmpty()) parts.add(status)
        else if (detectedLang.isNotEmpty()) parts.add(detectedLang)
        if (pinned) parts.add("Pinned")
        if (autoStopMinutes > 0) parts.add("${autoStopMinutes}m left")
        titleView?.text = parts.joinToString(" • ")
    }

    private fun applyPinnedStyle() {
        lockView?.apply {
            alpha = if (pinned) 1f else 0.55f
            setColorFilter(if (pinned) ACCENT else Color.WHITE)
            contentDescription = if (pinned) "Unpin overlay" else "Pin overlay"
        }
        handleView?.setBackgroundColor(
            if (pinned) Color.argb(120, 200, 200, 200) else Color.argb(200, 200, 200, 200)
        )
    }

    private fun iconButton(ctx: Context, resId: Int, description: String): ImageView =
        ImageView(ctx).apply {
            setImageResource(resId)
            setColorFilter(Color.WHITE)
            contentDescription = description
            scaleType = ImageView.ScaleType.CENTER_INSIDE
            val pad = dp(ctx, 9f).toInt()
            setPadding(pad, pad, pad, pad)
            layoutParams = LinearLayout.LayoutParams(dp(ctx, 40f).toInt(), dp(ctx, 40f).toInt())
        }

    fun dismiss(ctx: Context) {
        try {
            container?.let { wm?.removeView(it) }
        } catch (_: Throwable) {}
        container = null
        body = null
        titleView = null
        lockView = null
        handleView = null
        chipsRow = null
        chipSelect = null
        chipLangs = emptyList()
        params = null
        pinned = false
        autoStopMinutes = 0
    }

    private fun dp(ctx: Context, v: Float): Float =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, ctx.resources.displayMetrics)
}
