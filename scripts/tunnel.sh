#!/usr/bin/env bash
#
# Expose the local API so RevenueCat's webhook can reach it.
#
# A quick tunnel gets a fresh hostname every time it starts, and the webhook in
# the RevenueCat dashboard holds the old one — so entitlement silently stops
# arriving and the app just never notices a purchase. Nothing errors. This
# prints the exact URL to paste, and checks the tunnel actually reaches the API
# before telling you it worked.
#
# A permanent hostname needs a Cloudflare account and a named tunnel
# (`cloudflared tunnel create`), which is worth doing once there is a real
# deploy. Until then this is the honest version: ephemeral, but never guessed.
set -euo pipefail

PORT="${PORT:-4000}"
WEBHOOK_PATH="/api/subscription/webhook"

command -v cloudflared >/dev/null || {
  echo "cloudflared is not installed:  brew install cloudflared" >&2
  exit 1
}

curl -sf -o /dev/null "http://localhost:${PORT}/api/subscription/webhook" -X POST \
  --max-time 3 2>/dev/null || true

if ! lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Nothing is listening on :${PORT} — start the API first (pnpm api)." >&2
  exit 1
fi

LOG="$(mktemp -t saydle-tunnel)"
cloudflared tunnel --url "http://localhost:${PORT}" >"${LOG}" 2>&1 &
TUNNEL_PID=$!
trap 'kill "${TUNNEL_PID}" 2>/dev/null || true' EXIT

printf 'Starting tunnel'
URL=""
for _ in $(seq 1 30); do
  URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "${LOG}" | head -1 || true)"
  [ -n "${URL}" ] && break
  printf '.'
  sleep 1
done
echo

[ -n "${URL}" ] || { echo "Tunnel did not come up. Log: ${LOG}" >&2; exit 1; }

# Prove it reaches the API rather than just that a hostname exists. 401 is the
# right answer here: the webhook refuses an unsigned request, which means our
# handler is the thing on the other end.
CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${URL}${WEBHOOK_PATH}" \
  -H 'Content-Type: application/json' -d '{}' --max-time 20 || echo 000)"

case "${CODE}" in
  401) STATUS="reachable (401 = webhook refusing an unsigned request, as it should)" ;;
  000) echo "Tunnel is up but the API did not answer through it." >&2; exit 1 ;;
  *)   STATUS="answered with HTTP ${CODE} — check this is the Saydle API" ;;
esac

cat <<EOF

  Tunnel up — ${STATUS}

  Paste this into RevenueCat → Integrations → Webhooks → Webhook URL:

      ${URL}${WEBHOOK_PATH}

  The Authorization header value is unchanged; copy it with:

      printf 'Bearer %s' "\$(grep '^REVENUECAT_WEBHOOK_SECRET=' server/.env | cut -d= -f2-)" | pbcopy

  This hostname dies when you stop this script (Ctrl-C). The webhook will
  keep pointing at it and silently stop delivering, so update the URL each
  time you restart.

EOF

wait "${TUNNEL_PID}"
