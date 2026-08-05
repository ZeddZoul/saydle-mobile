package com.anonymous.saydlemobile

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.graphics.Color
import android.widget.RemoteViews
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
 */
class SaydleWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        appWidgetIds.forEach { id ->
            val views = RemoteViews(context.packageName, R.layout.saydle_widget)
            val payload = readPayload(context)

            views.setTextViewText(R.id.saydle_widget_text, affirmationFor(payload))

            payload?.optJSONObject("theme")?.let { theme ->
                // Colours come from the app's active theme; parse failures fall
                // back rather than throwing, because a widget that crashes on a
                // malformed hex just disappears from the home screen.
                safeColor(theme.optString("gradientEnd"))?.let {
                    views.setInt(R.id.saydle_widget_root, "setBackgroundColor", it)
                }
                safeColor(theme.optString("ink"))?.let {
                    views.setTextColor(R.id.saydle_widget_text, it)
                }
                safeColor(theme.optString("accent"))?.let {
                    views.setTextColor(R.id.saydle_widget_wordmark, it)
                }
            }

            appWidgetManager.updateAppWidget(id, views)
        }
    }

    private fun readPayload(context: Context): JSONObject? {
        // The plugin writes here; the name must match WIDGET_NAME in lib/widget.js.
        val prefs = context.getSharedPreferences(
            "${context.packageName}.widgetdata",
            Context.MODE_PRIVATE
        )

        val raw = prefs.getString("SaydleWidget", null) ?: return null

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
    }
}
