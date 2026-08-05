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

    private var background: LinearGradient {
        LinearGradient(
            colors: [
                Color(saydleHex: entry.theme?.gradientStart ?? "#FDEEEC"),
                Color(saydleHex: entry.theme?.gradientEnd ?? "#F7CAC5"),
            ],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    // The small family has room for the affirmation and nothing else; the
    // wordmark only earns its space at medium and above.
    private var showsWordmark: Bool { family != .systemSmall }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if showsWordmark {
                Text("SAYDLE")
                    .font(.system(size: 10, weight: .bold))
                    .kerning(1.6)
                    .foregroundColor(accent)
            }

            Text(entry.text)
                .font(.system(size: family == .systemSmall ? 15 : 19, weight: .medium, design: .serif))
                .foregroundColor(ink)
                .lineSpacing(3)
                .minimumScaleFactor(0.75)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)

            Spacer(minLength: 0)
        }
        .padding(family == .systemSmall ? 12 : 16)
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
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
