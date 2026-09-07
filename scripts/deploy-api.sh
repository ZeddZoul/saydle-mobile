#!/usr/bin/env bash
#
# Deploy the API to Cloud Run.
#
# Cloud Run rather than a generic host for one specific reason: generation already
# runs as saydle-api@saydle-web.iam.gserviceaccount.com, and attaching that service
# account to the service means Vertex authenticates with no key file at all —
# GOOGLE_APPLICATION_CREDENTIALS simply stops being needed. A key on disk is the
# thing most likely to leak, and this removes it rather than protecting it.
#
# Everything here is idempotent. Run it as often as you like.
set -euo pipefail

PROJECT="${GOOGLE_CLOUD_PROJECT:-saydle-web}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-saydle-api}"
SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-saydle-api@${PROJECT}.iam.gserviceaccount.com}"

say() { printf "\n\033[1m%s\033[0m\n" "$1"; }
die() { printf "\n\033[31m%s\033[0m\n\n" "$1" >&2; exit 1; }

command -v gcloud >/dev/null || die "gcloud is not installed. https://cloud.google.com/sdk/docs/install"

# The CLI's active project is global state shared with every other project on
# this machine, so it is passed explicitly on every call below rather than
# assumed. Deploying is NOT the ADC trap documented in CLAUDE.md — that is
# `gcloud auth application-default login`, which this never touches.
ACTIVE=$(gcloud config get-value account 2>/dev/null || true)
[ -n "$ACTIVE" ] && [ "$ACTIVE" != "(unset)" ] || die "Not signed in. Run: gcloud auth login"

say "Deploying $SERVICE to $PROJECT ($REGION) as $ACTIVE"

# --- Secrets ---------------------------------------------------------------
# Held in Secret Manager, never in the image and never in this file. Each is
# created once by hand; this only wires them to the service.
#
#   printf '%s' 'the-value' | gcloud secrets create MONGODB_URI \
#     --project="$PROJECT" --data-file=-
#
REQUIRED_SECRETS=(
  MONGODB_URI
  JWT_ACCESS_SECRET
  JWT_REFRESH_SECRET
  ELEVENLABS_API_KEY
  RESEND_API_KEY
  REVENUECAT_WEBHOOK_SECRET
)

missing=()
for name in "${REQUIRED_SECRETS[@]}"; do
  gcloud secrets describe "$name" --project="$PROJECT" >/dev/null 2>&1 || missing+=("$name")
done

if [ ${#missing[@]} -gt 0 ]; then
  say "Missing secrets in Secret Manager:"
  for name in "${missing[@]}"; do
    echo "  printf '%s' 'VALUE' | gcloud secrets create $name --project=$PROJECT --data-file=-"
  done
  die "Create the above, then run this again."
fi

SECRET_FLAGS=""
for name in "${REQUIRED_SECRETS[@]}"; do
  SECRET_FLAGS="${SECRET_FLAGS}${name}=${name}:latest,"
done
SECRET_FLAGS="${SECRET_FLAGS%,}"

# --- Deploy ----------------------------------------------------------------
# Source deploy: Cloud Build builds server/Dockerfile from the repo root, since
# the lockfile and pnpm-workspace.yaml are what define the dependency graph.
#
# --min-instances=0 keeps it free when idle. The tradeoff is a cold start on the
# first request after a quiet spell, which the app already tolerates: reads never
# wait on the model, and the client timeout is 15s.
say "Building and deploying…"

gcloud run deploy "$SERVICE" \
  --project="$PROJECT" \
  --region="$REGION" \
  --source=. \
  --service-account="$SERVICE_ACCOUNT" \
  --allow-unauthenticated \
  --port=8080 \
  --cpu=1 \
  --memory=512Mi \
  --min-instances=0 \
  --max-instances=4 \
  --timeout=60s \
  --set-env-vars="NODE_ENV=production,GOOGLE_CLOUD_PROJECT=${PROJECT},GOOGLE_CLOUD_LOCATION=${REGION},AI_ENABLED=true" \
  --set-secrets="$SECRET_FLAGS"

URL=$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" \
  --format='value(status.url)')

# --- Prove it ---------------------------------------------------------------
# A deploy that reports success and serves 500s is worse than one that fails, so
# this checks the database is actually reachable rather than just the process
# being up. `db: false` here means the Atlas IP allowlist, nine times out of ten.
say "Checking $URL/healthz"
BODY=$(curl -fsS --max-time 30 "$URL/healthz") || die "Deployed, but /healthz did not answer. Logs: gcloud run services logs read $SERVICE --project=$PROJECT --region=$REGION"

echo "  $BODY"
case "$BODY" in
  *'"db":true'*) ;;
  *) die "API is up but the database is not connected. Check MONGODB_URI and the Atlas IP allowlist (0.0.0.0/0 for Cloud Run, which has no fixed egress IP without a VPC connector)." ;;
esac

say "Live: $URL"
cat <<EOF

Point the app at it — this is inlined at BUILD time, so it must be set before
the APK is built, not after:

  eas.json  ->  build.preview.env.EXPO_PUBLIC_API_URL = "$URL"
                build.production.env.EXPO_PUBLIC_API_URL = "$URL"

Then:  pnpm build:apk

And in the RevenueCat dashboard, set the webhook to:

  $URL/api/subscription/webhook

EOF
