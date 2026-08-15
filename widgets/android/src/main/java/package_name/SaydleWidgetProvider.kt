package PACKAGE_PLACEHOLDER

// `package`/`import PACKAGE_PLACEHOLDER` are rewritten to the real application
// id at prebuild by the plugin's distPlaceholder mechanism — see app.json.
// R has to be imported explicitly here, or Kotlin cannot resolve it from a
// file the plugin copied into the app package.
import PACKAGE_PLACEHOLDER.R
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.os.Bundle
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import android.util.TypedValue
import android.widget.RemoteViews
import androidx.core.content.res.ResourcesCompat
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * The Android home-screen widget.
 *
 * Like its iOS counterpart it has no network and no session: it renders the
 * JSON snapshot the app last wrote to shared preferences. Android has no
 * timeline concept, so the day is resolved at draw time — which is simpler, and
 * means the widget rolls over correctly even if the app is never opened again.
 *
 * ## Why the card is a bitmap
 *
 * The whole card — gradient, glow, wordmark, quote and affirmation — is drawn
 * into a single bitmap and handed over as an ImageView. That is not the obvious
 * way to build a widget, and it is worth knowing why the obvious ways were
 * abandoned:
 *
 *  * `android:fontFamily="@font/fraunces_semibold"` in the layout compiles,
 *    ships the font in the APK, and renders **Roboto**. Tried and measured.
 *  * A `TypefaceSpan` carrying a real `Typeface` fares no better:
 *    `TypefaceSpan.writeToParcel` serialises only the *family name*, so the
 *    typeface is dropped crossing into the launcher's process. Also measured.
 *
 * Neither fails loudly. Both leave a widget that looks like a layout bug.
 * Canvas is the one surface where our own `Typeface` is unambiguously ours, so
 * the type is drawn rather than declared. The layout keeps plain TextViews as a
 * fallback: if the bitmap cannot be built, they are shown instead, off-brand but
 * readable. The affirmation is also set as the root's content description, since
 * drawn text says nothing to TalkBack.
 */
class SaydleWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        appWidgetIds.forEach { render(context, appWidgetManager, it) }
    }

    /**
     * Redraw when the reader resizes the widget.
     *
     * Without this the bitmap keeps the dimensions of the cell it was first
     * dropped into, and the launcher scales it — which stretches the type.
     */
    override fun onAppWidgetOptionsChanged(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetId: Int,
        newOptions: Bundle
    ) {
        render(context, appWidgetManager, appWidgetId)
    }

    private fun render(context: Context, manager: AppWidgetManager, id: Int) {
        val views = RemoteViews(context.packageName, R.layout.saydle_widget)
        val payload = readPayload(context)
        val theme = payload?.optJSONObject("theme")
        val text = affirmationFor(payload)

        val palette = Palette(
            ink = safeColor(theme?.optString("ink")) ?: DEFAULT_INK,
            accent = safeColor(theme?.optString("accent")) ?: DEFAULT_ACCENT,
            start = safeColor(theme?.optString("gradientStart")) ?: DEFAULT_START,
            end = safeColor(theme?.optString("gradientEnd")) ?: DEFAULT_END,
            dark = theme?.optBoolean("dark") ?: false
        )

        // The flat fill is the floor, not the goal: it is what shows behind a
        // failed bitmap, so it is set either way.
        views.setInt(R.id.saydle_widget_root, "setBackgroundColor", palette.end)
        views.setContentDescription(R.id.saydle_widget_root, text)

        val card = card(context, manager, id, text, palette)

        if (card != null) {
            views.setImageViewBitmap(R.id.saydle_widget_bg, card)
            // The fallback text must not show through the drawn card.
            views.setViewVisibility(R.id.saydle_widget_fallback, android.view.View.GONE)
        } else {
            views.setViewVisibility(R.id.saydle_widget_fallback, android.view.View.VISIBLE)
            views.setTextViewText(R.id.saydle_widget_text, text)
            views.setTextColor(R.id.saydle_widget_text, palette.ink)
            views.setTextColor(R.id.saydle_widget_wordmark, palette.accent)
            views.setInt(R.id.saydle_widget_dot, "setColorFilter", palette.accent)
        }

        manager.updateAppWidget(id, views)
    }

    private data class Palette(
        val ink: Int,
        val accent: Int,
        val start: Int,
        val end: Int,
        val dark: Boolean
    )

    // --- the card ------------------------------------------------------------

    /**
     * Sized from the launcher's reported cell so the circles stay circular and
     * the type stays unstretched, and capped because the bitmap crosses a
     * Binder transaction on its way to the launcher.
     */
    private fun card(
        context: Context,
        manager: AppWidgetManager,
        id: Int,
        text: String,
        palette: Palette
    ): Bitmap? {
        val options = manager.getAppWidgetOptions(id)
        val wDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0)
        val hDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0)

        val w = side(context, wDp)
        val h = side(context, hDp)

        return try {
            val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)

            field(context, canvas, w, h, palette)
            type(context, canvas, w, h, text, palette)

            bitmap
        } catch (e: Throwable) {
            // An OOM here costs the reader the card, never the widget.
            null
        }
    }

    /** Gradient plus the two-blob glow the app and the share card also use. */
    private fun field(context: Context, canvas: Canvas, w: Int, h: Int, palette: Palette) {
        val radius = dp(context, 24f)

        // Everything is drawn inside the card's own rounded shape; without the
        // clip the glow spills into the launcher's square corners.
        canvas.clipPath(Path().apply {
            addRoundRect(RectF(0f, 0f, w.toFloat(), h.toFloat()), radius, radius, Path.Direction.CW)
        })

        val paint = Paint(Paint.ANTI_ALIAS_FLAG)

        paint.shader = LinearGradient(
            0f, 0f, w.toFloat(), h.toFloat(), palette.start, palette.end, Shader.TileMode.CLAMP
        )
        canvas.drawRect(0f, 0f, w.toFloat(), h.toFloat(), paint)

        // Upper trailing: the main source, warm and wide.
        glow(canvas, paint, w * 0.88f, -w * 0.06f, w * 0.70f, palette.start, if (palette.dark) 0.30f else 0.55f)
        // Lower leading: a quieter counterweight, so the field has depth rather
        // than falling off to flat gradient in the corner.
        glow(canvas, paint, w * 0.10f, h - w * 0.06f, w * 0.58f, palette.accent, if (palette.dark) 0.18f else 0.38f)
    }

    /** The wordmark, the quote and the line — all in Fraunces. */
    private fun type(
        context: Context,
        canvas: Canvas,
        w: Int,
        h: Int,
        text: String,
        palette: Palette
    ) {
        val bold = font(context, R.font.fraunces_bold)
        val semi = font(context, R.font.fraunces_semibold)

        val pad = dp(context, 16f)
        val body = bodySize(context, w)

        // --- wordmark: dot, then SAYDLE letterspaced, as everywhere else ------
        val markSize = body * 0.58f
        val mark = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = bold
            textSize = markSize
            color = palette.accent
            letterSpacing = 0.22f
        }

        val dotR = dp(context, 2.5f)
        val markY = pad + markSize
        canvas.drawCircle(
            pad + dotR,
            markY - markSize * 0.32f,
            dotR,
            Paint(Paint.ANTI_ALIAS_FLAG).apply { color = palette.accent }
        )
        canvas.drawText("SAYDLE", pad + dotR * 2 + dp(context, 5f), markY, mark)

        // --- the line, wrapped -----------------------------------------------
        val width = (w - pad * 2).toInt()
        val line = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = semi
            textSize = body
            color = palette.ink
        }

        val layout = StaticLayout.Builder
            .obtain(text, 0, text.length, line, width)
            .setAlignment(Layout.Alignment.ALIGN_NORMAL)
            .setLineSpacing(body * 0.28f, 1f)
            .setIncludePad(false)
            .setMaxLines(MAX_LINES)
            .setEllipsize(android.text.TextUtils.TruncateAt.END)
            .build()

        // The quote is texture rather than punctuation: the accent at low alpha,
        // set immediately above the first line and sized against it.
        val quoteSize = body * 2.2f
        val quote = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = bold
            textSize = quoteSize
            color = withAlpha(palette.accent, if (palette.dark) 0x47 else 0x57)
        }

        // Fraunces sets the quote high in its em box, so the mark's own metrics
        // leave a hole beneath it. Anchoring on the glyph's descent rather than
        // its baseline is what keeps it tight to the text without touching it.
        val quoteDrop = quoteSize * 0.34f

        // The block is optically centred in the space under the wordmark: a 2x2
        // cell is far taller relative to its width than any iOS family, and
        // top-aligning as iOS does leaves it looking half-empty.
        val top = markY + dp(context, 10f)
        val block = quoteDrop + layout.height
        val start = (top + (h - pad - top - block) / 2f).coerceAtLeast(top)

        canvas.drawText("“", pad, start + quoteSize * 0.72f, quote)

        canvas.save()
        canvas.translate(pad, start + quoteDrop)
        layout.draw(canvas)
        canvas.restore()
    }

    private fun glow(
        canvas: Canvas,
        paint: Paint,
        cx: Float,
        cy: Float,
        radius: Float,
        color: Int,
        alpha: Float
    ) {
        paint.shader = RadialGradient(
            cx, cy, radius,
            withAlpha(color, (alpha * 255).toInt()),
            withAlpha(color, 0),
            Shader.TileMode.CLAMP
        )
        canvas.drawCircle(cx, cy, radius, paint)
    }

    /** The line scales with the cell, so a resized widget is not a shrunken one. */
    private fun bodySize(context: Context, widthPx: Int): Float {
        val widthDp = widthPx / context.resources.displayMetrics.density
        val sp = when {
            widthDp < 180f -> 15f
            widthDp < 260f -> 17f
            else -> 21f
        }
        return TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_SP, sp, context.resources.displayMetrics
        )
    }

    private fun font(context: Context, fontRes: Int): Typeface? = try {
        ResourcesCompat.getFont(context, fontRes)
    } catch (e: Exception) {
        null
    }

    private fun dp(context: Context, value: Float): Float = TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP, value, context.resources.displayMetrics
    )

    private fun side(context: Context, dp: Int): Int {
        if (dp <= 0) return DEFAULT_SIDE
        return dp(context, dp.toFloat()).toInt().coerceIn(MIN_SIDE, MAX_SIDE)
    }

    private fun withAlpha(color: Int, alpha: Int): Int =
        (color and 0x00FFFFFF) or ((alpha and 0xFF) shl 24)

    // --- data ----------------------------------------------------------------

    private fun readPayload(context: Context): JSONObject? {
        // Both the file name and the key are fixed by the plugin's own Android
        // module, which does `getSharedPreferences(packageName + ".widgetdata")`
        // and writes under the key "widgetdata". Neither is ours to choose —
        // reading anything else here finds nothing, silently, forever.
        val prefs = context.getSharedPreferences(
            "${context.packageName}.widgetdata",
            Context.MODE_PRIVATE
        )

        val raw = prefs.getString("widgetdata", null) ?: return null

        return try {
            JSONObject(raw)
        } catch (e: Exception) {
            null
        }
    }

    private fun affirmationFor(payload: JSONObject?): String {
        val days = payload?.optJSONArray("days") ?: return PLACEHOLDER
        if (days.length() == 0) return PLACEHOLDER

        val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

        for (i in 0 until days.length()) {
            val day = days.optJSONObject(i) ?: continue
            if (day.optString("date") == today) return day.optString("text", PLACEHOLDER)
        }

        // Past the end of the snapshot: a stale line beats an empty square.
        return days.optJSONObject(days.length() - 1)?.optString("text") ?: PLACEHOLDER
    }

    private fun safeColor(hex: String?): Int? {
        if (hex.isNullOrBlank()) return null
        return try {
            Color.parseColor(hex)
        } catch (e: IllegalArgumentException) {
            null
        }
    }

    companion object {
        private const val PLACEHOLDER = "I am allowed to start small."
        private const val MAX_LINES = 6

        private val DEFAULT_INK = Color.parseColor("#38223A")
        private val DEFAULT_ACCENT = Color.parseColor("#FF6F61")
        private val DEFAULT_START = Color.parseColor("#FDEEEC")
        private val DEFAULT_END = Color.parseColor("#F7CAC5")

        // The launcher can report 0 before the first resize; these keep the card
        // sane rather than letting it collapse or blow past the Binder cap.
        private const val DEFAULT_SIDE = 480
        private const val MIN_SIDE = 160
        private const val MAX_SIDE = 1024
    }
}
