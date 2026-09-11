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
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Draws a draggable floating panel over other apps. It contains translated text
 * blocks stacked vertically. The panel can be dragged up/down/left/right so the
 * app below stays usable, and a close button ends the session.
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
    private var params: WindowManager.LayoutParams? = null
    private var wm: WindowManager? = null

    fun show(ctx: Context, onClose: () -> Unit) {
        if (container != null) return
        val windowManager = ctx.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        wm = windowManager

        val dm = DisplayMetrics()
        @Suppress("DEPRECATION")
        windowManager.defaultDisplay.getMetrics(dm)

        val panel = FrameLayout(ctx)
        val bg = GradientDrawable().apply {
            cornerRadius = dp(ctx, 20f)
            setColor(Color.argb(235, 20, 20, 20))
            setStroke(dp(ctx, 1f).toInt(), Color.argb(120, 180, 220, 180))
        }
        panel.background = bg
        panel.setPadding(dp(ctx, 12f).toInt(), dp(ctx, 10f).toInt(), dp(ctx, 12f).toInt(), dp(ctx, 12f).toInt())

        val col = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
        }

        // Header row: drag handle + title + close.
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

        val title = TextView(ctx).apply {
            text = "LensTranslate"
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
        }
        header.addView(title, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        titleView = title

        val close = TextView(ctx).apply {
            text = "✕"
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            setPadding(dp(ctx, 8f).toInt(), dp(ctx, 2f).toInt(), dp(ctx, 8f).toInt(), dp(ctx, 4f).toInt())
        }
        close.setOnClickListener {
            dismiss(ctx)
            onClose()
        }
        header.addView(close)

        col.addView(header)

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
        lp.x = dp(ctx, 16f).toInt()
        lp.y = dp(ctx, 80f).toInt()
        params = lp

        // Drag anywhere on the header.
        var startX = 0
        var startY = 0
        var startRawX = 0f
        var startRawY = 0f
        header.setOnTouchListener { _, ev ->
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
                else -> false
            }
        }

        windowManager.addView(panel, lp)
    }

    fun updateBlocks(ctx: Context, blocks: List<OverlayBlock>, detected: String) {
        val body = this.body ?: return
        titleView?.text = if (detected.isNotEmpty()) "LensTranslate • $detected" else "LensTranslate"
        body.removeAllViews()
        if (blocks.isEmpty()) {
            val empty = TextView(ctx).apply {
                text = "Scanning for text…"
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
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
                val bg = GradientDrawable().apply {
                    cornerRadius = dp(ctx, 10f)
                    setColor(Color.argb(220, 40, 66, 40))
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

    fun dismiss(ctx: Context) {
        try {
            container?.let { wm?.removeView(it) }
        } catch (_: Throwable) {}
        container = null
        body = null
        titleView = null
        params = null
    }

    private fun dp(ctx: Context, v: Float): Float =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, ctx.resources.displayMetrics)
}
