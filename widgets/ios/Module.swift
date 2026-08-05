import WidgetKit
import SwiftUI

// The App Group is the only channel between the app and the widget: the widget
// runs in its own process with no network and no session, so everything it
// shows has to already be sitting here.
//
// Must match APP_GROUP in lib/widget.js and the entitlement in app.json.
let SAYDLE_APP_GROUP = "group.com.anonymous.saydle-mobile.widget"

struct SaydleDay: Codable {
    let date: String
    let text: String
}

struct SaydleTheme: Codable {
    let slug: String
    let gradientStart: String
    let gradientEnd: String
    let ink: String
    let accent: String
    let dark: Bool
}

struct SaydlePayload: Codable {
    let version: Int
    let updatedAt: String?
    let days: [SaydleDay]
    let theme: SaydleTheme?
}

enum SaydleStore {
    /// Reads the snapshot the app last wrote. Returns nil for "nothing yet",
    /// which is a real state — a freshly added widget on a signed-out phone.
    static func load() -> SaydlePayload? {
        guard
            let defaults = UserDefaults(suiteName: SAYDLE_APP_GROUP),
            let raw = defaults.string(forKey: "SaydleWidget"),
            let data = raw.data(using: .utf8)
        else { return nil }

        return try? JSONDecoder().decode(SaydlePayload.self, from: data)
    }

    /// The widget formats its own date rather than trusting a stored "today":
    /// a snapshot written on Monday must still show Tuesday's line on Tuesday,
    /// with the app never having been opened.
    static func today() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone.current
        return formatter.string(from: Date())
    }
}

extension Color {
    /// Hex from the JS theme. Falls back to the brand pink rather than crashing
    /// a widget over a malformed colour.
    init(saydleHex hex: String) {
        var value: UInt64 = 0
        let cleaned = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))

        guard cleaned.count == 6, Scanner(string: cleaned).scanHexInt64(&value) else {
            self = Color(red: 0.97, green: 0.79, blue: 0.77)
            return
        }

        self = Color(
            red: Double((value & 0xFF0000) >> 16) / 255.0,
            green: Double((value & 0x00FF00) >> 8) / 255.0,
            blue: Double(value & 0x0000FF) / 255.0
        )
    }
}
