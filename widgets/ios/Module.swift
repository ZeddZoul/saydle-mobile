import ExpoModulesCore
import WidgetKit

/**
 * The JS bridge.
 *
 * IMPORTANT: this file replaces the plugin's own `ExpoWidgetsModule.swift`
 * wholesale — its shipped version is a placeholder that defines the module name
 * and nothing else. On iOS the plugin provides no `setWidgetData` at all (unlike
 * Android, which ships a working one), so it has to be written here or the JS
 * call silently reaches nothing.
 *
 * Keep this file to the bridge alone. Anything the *widget* needs belongs in
 * SaydleShared.swift, which is the file compiled into the extension target.
 */
// Duplicated rather than shared: SaydleShared.swift is compiled into the widget
// extension, not into this target, so referencing its constants here would not
// resolve. These are only fallbacks — lib/widget.js passes both explicitly.
private let FALLBACK_APP_GROUP = "group.com.saydle.app.expowidgets"
private let FALLBACK_KEY = "SaydleWidget"

public class ExpoWidgetsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoWidgets")

    // Called from lib/widget.js as setWidgetData(json, appGroup, key).
    Function("setWidgetData") { (json: String, group: String?, key: String?) -> Void in
      guard let defaults = UserDefaults(suiteName: group ?? FALLBACK_APP_GROUP) else {
        return
      }

      defaults.set(json, forKey: key ?? FALLBACK_KEY)

      // Without this the widget keeps its old timeline until the system next
      // decides to refresh it, which can be hours.
      WidgetCenter.shared.reloadAllTimelines()
    }
  }
}
