#!/usr/bin/env bash
# Bootstrap and deploy the API on Railway.
#
# The counterpart to scripts/deploy-api.sh, which targets Cloud Run. Railway is
# the faster first deploy; Cloud Run is the one that needs no Vertex key file at
# all. Nothing in the codebase cares which is serving.
#
# Secrets are read from server/.env.railway.local (gitignored) and never appear
# in this file. Idempotent: re-running updates variables and redeploys.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE="${SERVICE:-saydle-api}"
ENVFILE="$root/server/.env.railway.local"

command -v railway >/dev/null || { echo "railway CLI not installed: npm i -g @railway/cli" >&2; exit 1; }
[ -f "$ENVFILE" ] || { echo "missing $ENVFILE" >&2; exit 1; }

say() { printf "\n\033[1m%s\033[0m\n" "$1"; }

# Refuse to ship a placeholder. A deploy that boots and cannot reach its
# database is worse than one that fails to start, which is why this checks here
# and the healthcheck below checks "db":true rather than trusting a 200.
if grep -qE '=(.*)(FILL|REPLACE-ME|CHANGE-ME)' "$ENVFILE"; then
  echo "Placeholders still in $ENVFILE:" >&2
  grep -nE '=(.*)(FILL|REPLACE-ME|CHANGE-ME)' "$ENVFILE" | sed -E 's/=.*/=<placeholder>/' >&2
  exit 1
fi

say "Creating service $SERVICE (no-op if it exists)"
railway add -s "$SERVICE" >/dev/null 2>&1 || true

say "Setting variables"
while IFS= read -r line; do
  [ -z "$line" ] && continue
  case "$line" in \#*) continue ;; esac
  case "$line" in *=*) ;; *) continue ;; esac
  key="${line%%=*}"
  railway variables set "$line" -s "$SERVICE" >/dev/null
  echo "  $key"
done < "$ENVFILE"

say "Deploying (builds server/Dockerfile)"
railway up -s "$SERVICE" --ci

say "Ensuring a public domain"
railway domain -s "$SERVICE" || true

echo
echo "Next: check /healthz reports \"db\":true, then point"
echo "  1. EXPO_PUBLIC_API_URL in eas.json (both preview and production)"
echo "  2. the RevenueCat webhook at <url>/api/subscription/webhook"
