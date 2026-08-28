/**
 * Theme slugs the API will accept.
 *
 * The palettes themselves live on the client (`theme/themes.js`) — the server
 * only needs to know which slugs are real, so an unknown one is rejected at the
 * boundary rather than stored and silently ignored.
 *
 * Keep this list in sync with the client when adding a theme.
 */
export const THEME_SLUGS = ["dawn", "blush", "sage", "sky", "dusk", "midnight"];
