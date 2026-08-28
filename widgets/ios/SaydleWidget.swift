import WidgetKit
import SwiftUI

struct SaydleEntry: TimelineEntry {
    let date: Date
    let text: String
    let theme: SaydleTheme?
}

private let PLACEHOLDER = "I am allowed to start small."

struct SaydleProvider: TimelineProvider {
    func placeholder(in context: Context) -> SaydleEntry {
        SaydleEntry(date: Date(), text: PLACEHOLDER, theme: SaydleStore.load()?.theme)
    }

    func getSnapshot(in context: Context, completion: @escaping (SaydleEntry) -> Void) {
        completion(entry(for: Date()))
    }

    /// One entry per day the app handed over.
    ///
    /// The whole fortnight is scheduled at once precisely because the widget
    /// cannot fetch: if the app is never opened again, the widget still turns
    /// over correctly every morning until the snapshot runs out.
    func getTimeline(in context: Context, completion: @escaping (Timeline<SaydleEntry>) -> Void) {
        let payload = SaydleStore.load()
        let calendar = Calendar.current
        let startOfToday = calendar.startOfDay(for: Date())

        var entries: [SaydleEntry] = []

        for offset in 0..<(payload?.days.count ?? 1) {
            guard let day = calendar.date(byAdding: .day, value: offset, to: startOfToday) else {
                continue
            }
            entries.append(entry(for: day))
        }

        if entries.isEmpty { entries.append(entry(for: Date())) }

        // .atEnd: when the snapshot is exhausted, ask again — by then the app
        // has probably been opened and written a fresh fortnight.
        completion(Timeline(entries: entries, policy: .atEnd))
    }

    private func entry(for date: Date) -> SaydleEntry {
        let payload = SaydleStore.load()

        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone.current
        let key = formatter.string(from: date)

        // Falls back to the last line we were given rather than going blank: a
        // stale affirmation is far better than an empty square on a home screen.
        let text = payload?.days.first(where: { $0.date == key })?.text
            ?? payload?.days.last?.text
            ?? PLACEHOLDER

        return SaydleEntry(date: date, text: text, theme: payload?.theme)
    }
}

struct SaydleWidgetView: View {
    @Environment(\.widgetFamily) private var family
    var entry: SaydleEntry

    private var ink: Color { Color(saydleHex: entry.theme?.ink ?? "#38223A") }
    private var accent: Color { Color(saydleHex: entry.theme?.accent ?? "#FF6F61") }
    private var soft: Color { Color(saydleHex: entry.theme?.gradientStart ?? "#FDEEEC") }
    private var isDark: Bool { entry.theme?.dark ?? false }

    private var background: LinearGradient {
        LinearGradient(
            colors: [
                Color(saydleHex: entry.theme?.gradientStart ?? "#FDEEEC"),
                Color(saydleHex: entry.theme?.gradientEnd ?? "#F7CAC5"),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    // Small has room for the words and nothing else; the wordmark only earns its
    // space once there is a second line's worth of width to put it on.
    private var isSmall: Bool { family == .systemSmall }

    private var affirmationSize: CGFloat {
        switch family {
        case .systemSmall: return 15
        case .systemLarge: return 25
        default: return 19
        }
    }

    /// The wordmark, in Fraunces — the same face and letterspacing as the app's.
    private var wordmark: some View {
        HStack(spacing: 5) {
            Circle()
                .fill(accent)
                .frame(width: 5, height: 5)

            Text("SAYDLE")
                .font(SaydleFont.displayBold(10))
                .kerning(2.2)
                .foregroundColor(accent)
        }
    }

    /**
     * The affirmation, with the opening quote above it.
     *
     * Above rather than behind: at this weight Fraunces' quote is far too solid
     * to sit under text — its serif tail cut straight through the first line's
     * capitals. It gets its own row now, pulled tight by a negative bottom
     * padding, because the glyph sits high in the em box and would otherwise
     * leave a hole beneath it. Same treatment as the share card.
     */
    private var affirmation: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("\u{201C}")
                .font(SaydleFont.displayBold(affirmationSize * 2.2))
                .foregroundColor(accent.opacity(isDark ? 0.28 : 0.34))
                .fixedSize()
                // Pulled from the TOP, never the bottom. Fraunces sets its
                // quote low in the line box — the slack is above the glyph, not
                // beneath it — so any negative *bottom* padding drives the mark
                // straight into the first line's capitals. Twice tried, twice
                // overlapped. Closing the gap from above cannot touch the text.
                .padding(.top, -affirmationSize * 0.55)
                .accessibilityHidden(true)

            Text(entry.text)
                .font(SaydleFont.display(affirmationSize))
                .foregroundColor(ink)
                .lineSpacing(affirmationSize * 0.28)
                .minimumScaleFactor(0.7)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            SaydleGlow(accent: accent, soft: soft, dark: isDark)

            VStack(alignment: .leading, spacing: 0) {
                if !isSmall {
                    wordmark
                    Spacer(minLength: 12)
                }

                affirmation

                Spacer(minLength: 0)

                if family == .systemLarge {
                    Rectangle()
                        .fill(ink.opacity(0.12))
                        .frame(height: 1)
                        .padding(.bottom, 9)

                    Text(entry.date, format: .dateTime.weekday(.wide).month().day())
                        .font(SaydleFont.display(12))
                        .foregroundColor(ink.opacity(0.5))
                }
            }
            .padding(isSmall ? 15 : 18)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .widgetBackgroundCompat(background)
    }
}

/// iOS 17 requires the background to be declared through `containerBackground`;
/// earlier versions have no such modifier. This keeps one call site.
extension View {
    @ViewBuilder
    func widgetBackgroundCompat<Background: View>(_ background: Background) -> some View {
        if #available(iOS 17.0, *) {
            self.containerBackground(for: .widget) { background }
        } else {
            self.background(background)
        }
    }
}

struct SaydleWidget: Widget {
    let kind: String = "SaydleWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SaydleProvider()) { entry in
            SaydleWidgetView(entry: entry)
        }
        .configurationDisplayName("Today's affirmation")
        .description("The line you're carrying today, on your home screen.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
