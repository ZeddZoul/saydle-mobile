# Deploying the API on Railway

The repo is Railway-ready: `railway.json` points the build at
`server/Dockerfile` (the image is proven locally, see the Dockerfile) and the
healthcheck at `/healthz`. The whole deploy is: create the service, paste the
variables, watch the healthcheck go green.

## 1. Create the service

Railway dashboard → New Project → **Deploy from GitHub repo** → pick
`saydle-mobile`. It reads `railway.json` and builds from the Dockerfile with
the repo root as context (the lockfile and `pnpm-workspace.yaml` at the root
are what make the install work, so do not set a Root Directory).

## 2. Variables

Paste these under the service's **Variables** tab. Railway injects `PORT`
itself; the server honours it.

| Variable                    | Value                                          | Notes                             |
| --------------------------- | ---------------------------------------------- | --------------------------------- |
| `NODE_ENV`                  | `production`                                   |                                   |
| `MONGODB_URI`               | from Atlas                                     | see step 3                        |
| `JWT_ACCESS_SECRET`         | 32+ random chars                               | `openssl rand -hex 32`            |
| `JWT_REFRESH_SECRET`        | 32+ random chars, **different**                | boot refuses equal secrets        |
| `ELEVENLABS_API_KEY`        | from ElevenLabs                                | omit = device-speech fallback     |
| `RESEND_API_KEY`            | from Resend                                    | omit = codes logged, not emailed  |
| `MAIL_FROM`                 | `Saydle <noreply@saydle.com>`                  | domain must be verified in Resend |
| `REVENUECAT_WEBHOOK_SECRET` | from the RC webhook config                     |                                   |
| `AI_ENABLED`                | `true`                                         |                                   |
| `GOOGLE_CLOUD_PROJECT`      | `saydle-web`                                   |                                   |
| `GOOGLE_CLOUD_LOCATION`     | `us-central1`                                  |                                   |
| `GOOGLE_CREDENTIALS_JSON`   | the service account key, whole JSON, one paste | see below                         |

**`GOOGLE_CREDENTIALS_JSON` is the Railway-specific part.** Railway has no
attached identities and no secret files, so the Vertex key travels as an env
var: paste the entire JSON of the `saydle-api@saydle-web` key. At boot the
server writes it to a private tmp file and points Google's libraries at it
(`server/src/config/googleCredentials.js`). A truncated paste fails the boot
loudly instead of letting Vertex 403 quietly later.

## 3. The database

Atlas free tier. Railway has no static egress IP on the standard plans, so the
Atlas Network Access list needs `0.0.0.0/0`, same as any egress-dynamic host.
The `/healthz` check reports `"db":true` only when the database is actually
reachable, which is why the healthcheck is pointed there: a deploy that cannot
reach Atlas fails visibly instead of serving 500s.

## 4. After the first green deploy

Railway gives the service a `*.up.railway.app` domain (add `api.saydle.com`
under Settings → Domains when ready). Three things then point at it:

1. `eas.json` → `EXPO_PUBLIC_API_URL` in **both** `preview` and `production`.
   Inlined at build time: set it before building, not after.
2. RevenueCat dashboard → webhook URL → `<url>/api/subscription/webhook`.
3. A browser sanity pass: `<url>/healthz` shows `"db":true`, and
   `<url>/legal/privacy` renders.

## What about `pnpm deploy:api`?

That script targets Cloud Run and stays in the repo — it is the path that
needs no key file at all, worth revisiting at scale. Railway is the faster
first deploy; nothing in the codebase cares which one is serving.
