#!/usr/bin/env bash
# Regenerate the app icons from scripts/icons.html.
#
# Headless Chrome rather than an image library, for one reason: it is the only
# thing on a stock Mac that can set type in our actual Fraunces TTF. The old
# hand-made logo.png was in some other face, which is why the splash never
# matched the landing screen.
#
# Sizing is load-bearing — see the note in CLAUDE.md. Android shows only the
# central 72dp of the 108dp adaptive canvas, so check the result against a mask
# before shipping it; the wordmark has to clear the circle by its diagonal.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# Absolute, because the rendered copy lives in a temp dir: a relative font URL
# resolves against *that* directory, fails, and Chrome quietly falls back to a
# system serif — producing an icon that looks plausible and is not our typeface.
font="file://$root/widgets/fonts/Fraunces_700Bold.ttf"

# Palette per theme, mirroring theme/themes.js. Kept here rather than parsed out
# of the JS because these are build-time art decisions: the glow is a lightened
# gradient start, which is a drawing choice, not a token the app reads.
#   slug|gradientStart|gradientEnd|ink|glowRGB
THEMES=(
  "dawn|#fdeeec|#f7cac5|#38223a|253, 238, 236"
  "blush|#fff1e8|#f6c9c0|#3a2430|255, 241, 232"
  "sage|#f0f4ec|#cbdac6|#26332a|240, 244, 236"
  "sky|#eef4fa|#c7dcec|#1f2e3d|238, 244, 250"
  "dusk|#5b3a56|#2e1f33|#f6e9ee|123, 86, 116"
  "midnight|#243347|#131a26|#eaf0f7|52, 74, 99"
)

palette () { # <slug> -> exports START END INK GLOW GLOW_FADE
  local row
  for row in "${THEMES[@]}"; do
    if [ "${row%%|*}" = "$1" ]; then
      IFS='|' read -r _ START END INK RGB <<< "$row"
      GLOW="rgba($RGB, 0.85)"
      GLOW_FADE="rgba($RGB, 0)"
      return 0
    fi
  done
  echo "unknown theme: $1" >&2
  return 1
}

shot () { # <body class> <out> [extra chrome flags]
  sed -e "s/BODY_CLASS/$1/" -e "s|FONT_URL|$font|" \
      -e "s|GRADIENT_START|$START|" -e "s|GRADIENT_END|$END|" \
      -e "s|INK|$INK|" -e "s|GLOW_FADE|$GLOW_FADE|" -e "s|GLOW|$GLOW|" \
      "$root/scripts/icons.html" > "$tmp/render.html"
  "$chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --screenshot="$2" --window-size=1024,1024 ${3:-} "file://$tmp/render.html" 2>/dev/null
}

# The default set, in the default theme.
palette dawn
shot "bleed full" "$root/assets/icon.png"
shot "safe"       "$root/assets/adaptive-icon.png"   --default-background-color=00000000
shot "safe mono"  "$root/assets/monochrome-icon.png" --default-background-color=00000000
echo "wrote assets/icon.png, assets/adaptive-icon.png, assets/monochrome-icon.png"

# One full-bleed icon per theme, for the alternate-icon picker.
mkdir -p "$root/assets/icons"
for row in "${THEMES[@]}"; do
  slug="${row%%|*}"
  palette "$slug"
  shot "bleed full" "$root/assets/icons/$slug.png"
  echo "wrote assets/icons/$slug.png"
done
