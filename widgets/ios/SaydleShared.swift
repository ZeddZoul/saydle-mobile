import WidgetKit
import SwiftUI

/**
 * Types and helpers for the widget extension.
 *
 * This lives OUTSIDE Module.swift on purpose. `widgets/ios/Module.swift` is
 * copied over the plugin's own ExpoWidgetsModule and compiled into the *app*;
 * every other .swift file here is compiled into the *widget extension*. Shared
 * code therefore has to be in a file like this one, or the widget will not see
 * it.
 *
 * The App Group suffix is not ours to choose: @bittingz/expo-widgets derives it
 * as `group.<bundleIdentifier>.expowidgets` and does not read it from config.
 * Any other name gives the widget an empty container to read from forever.
 */
let SAYDLE_APP_GROUP = "group.com.saydle.app.expowidgets"

// The key the app writes under — see WIDGET_NAME in lib/widget.js.
let SAYDLE_KEY = "SaydleWidget"

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
            let raw = defaults.string(forKey: SAYDLE_KEY),
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

// MARK: - Brand

/**
 * Fraunces, the same display face the app uses.
 *
 * Bundled into the extension by @bittingz/expo-native-fonts (see app.json) —
 * a widget has no access to the app's fonts, so the file has to be inside the
 * extension itself. The PostScript names below are what iOS registers, and they
 * are NOT the filenames.
 *
 * `fallback:` matters: a font that failed to register would otherwise render
 * nothing at all, and a blank widget is worse than one in the system serif.
 */
enum SaydleFont {
    static func display(_ size: CGFloat) -> Font {
        Font.custom("Fraunces-SemiBold", size: size)
    }

    static func displayBold(_ size: CGFloat) -> Font {
        Font.custom("Fraunces-Bold", size: size)
    }
}

extension Color {
    /// Same colour at a chosen opacity — used for the quote mark and hairlines,
    /// which should read as the accent without competing with the words.
    func saydleSoft(_ opacity: Double) -> Color {
        self.opacity(opacity)
    }
}

/**
 * The warmth behind the words.
 *
 * Two offset radial washes rather than one: a single centred blob reads as a
 * vignette, whereas two that overlap off-centre give the light somewhere to
 * come *from*. Same intent as the app's generative artwork, simplified because
 * a widget is small, static, and redrawn rarely.
 *
 * Dark themes take roughly half the opacity — the same value reads far brighter
 * against a dark backdrop, and a glow that outshines the type defeats the point.
 */
struct SaydleGlow: View {
    var accent: Color
    var soft: Color
    var dark: Bool

    private var strong: Double { dark ? 0.30 : 0.55 }
    private var faint: Double { dark ? 0.18 : 0.38 }

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width

            ZStack {
                // Upper trailing: the main source, warm and wide.
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [soft.opacity(strong), soft.opacity(0)],
                            center: .center,
                            startRadius: 0,
                            endRadius: w * 0.70
                        )
                    )
                    .frame(width: w * 1.5, height: w * 1.5)
                    .offset(x: w * 0.38, y: -w * 0.46)

                // Lower leading: a quieter counterweight so the field has depth
                // rather than falling off to flat gradient in the corner.
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [accent.opacity(faint), accent.opacity(0)],
                            center: .center,
                            startRadius: 0,
                            endRadius: w * 0.58
                        )
                    )
                    .frame(width: w * 1.15, height: w * 1.15)
                    .offset(x: -w * 0.40, y: w * 0.44)
            }
        }
    }
}
