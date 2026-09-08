#!/usr/bin/env bash
# The Play Store's required 1024x500 feature graphic, rendered the same way as
# the icons: headless Chrome, so the wordmark is real Fraunces rather than a
# lookalike. Output: docs/store/feature-graphic.png
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT

# Absolute font URL: a relative one resolves against the temp dir, fails, and
# Chrome silently substitutes a system serif. See icons.sh.
font="file://$root/widgets/fonts/Fraunces_700Bold.ttf"
sed "s|FONT_URL|$font|" "$root/scripts/feature-graphic.html" > "$tmp/fg.html"

mkdir -p "$root/docs/store"
"$chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=1024,500 --screenshot="$root/docs/store/feature-graphic.png" \
  "file://$tmp/fg.html" 2>/dev/null
sips -g pixelWidth -g pixelHeight "$root/docs/store/feature-graphic.png" | tail -2
