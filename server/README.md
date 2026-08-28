# Saydle API

Node.js + Express 5 + Mongoose backend for the Saydle app. ESM, plain JavaScript.

## Setup

```bash
cp .env.example .env
```

Fill in `MONGODB_URI` and generate two different secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Then, from the repo root:

```bash
pnpm install
pnpm --filter @saydle/server migrate
pnpm --filter @saydle/server dev
```

The API listens on `http://localhost:4000`.

## Scripts

| Command        | What it does                                                   |
| -------------- | -------------------------------------------------------------- |
| `pnpm dev`     | Watch-mode server, loads `.env` via Node's native `--env-file` |
| `pnpm start`   | Production entry (expects env vars to be set by the platform)  |
| `pnpm test`    | Vitest + Supertest against an in-memory MongoDB                |
| `pnpm migrate` | Applies pending migrations, records them in `_migrations`      |

The first `pnpm test` downloads a ~66 MB mongod binary and caches it.

## Endpoints

All responses are JSON. Errors are always `{ error: { code, message, details? } }`.

| Method          | Path                                | Auth   | Purpose                                                           |
| --------------- | ----------------------------------- | ------ | ----------------------------------------------------------------- |
| `GET`           | `/healthz`                          | —      | Liveness + DB reachability (503 when Mongo is down)               |
| `POST`          | `/api/auth/register`                | —      | Create account, returns user + token pair                         |
| `POST`          | `/api/auth/login`                   | —      | Returns user + token pair                                         |
| `POST`          | `/api/auth/refresh`                 | —      | Rotates a refresh token, returns a new pair                       |
| `POST`          | `/api/auth/logout`                  | —      | Revokes one refresh token (always 204)                            |
| `GET`           | `/api/auth/me`                      | Bearer | Current user                                                      |
| `DELETE`        | `/api/auth/me`                      | Bearer | Deletes the account and every session                             |
| `POST`          | `/api/auth/forgot-password`         | —      | Emails a six-digit reset code. **Always 204**                     |
| `POST`          | `/api/auth/reset-password`          | —      | Consumes the code, sets the password, revokes all sessions        |
| `GET`           | `/api/affirmations/today`           | Bearer | Today's entry, in the user's timezone                             |
| `GET`           | `/api/affirmations/feed?days=30`    | Bearer | **Offline sync** — scheduled days with text embedded              |
| `POST`          | `/api/affirmations/feed/:date/seen` | Bearer | Marks a day seen (idempotent)                                     |
| `GET`           | `/api/affirmations/favorites`       | Bearer | Favorites, newest first                                           |
| `PUT`           | `/api/affirmations/:id/favorite`    | Bearer | Adds a favorite (idempotent)                                      |
| `DELETE`        | `/api/affirmations/:id/favorite`    | Bearer | Removes a favorite (idempotent)                                   |
| `GET`           | `/api/categories`                   | Bearer | Active categories                                                 |
| `GET` / `PATCH` | `/api/preferences`                  | Bearer | Read / update core personalization + timezone                     |
| `GET`           | `/api/streak`                       | Bearer | Current/longest streak + the current Mon–Sun week                 |
| `GET`           | `/api/profile`                      | Bearer | Progressive profile + completeness score + next nudge suggestions |
| `PATCH`         | `/api/profile`                      | Bearer | Update optional profile fields (`null` clears one)                |

## Password reset

A six-digit code (not a link), so it works when the email is opened on another device and needs no
deep-link setup. Only the SHA-256 is stored; codes last 15 minutes, are single-use, and a new request
supersedes the previous one.

Six digits is a million possibilities, so **attempts are the real boundary, not secrecy** — five wrong
guesses burn the code. `POST /forgot-password` answers **204 whether or not the address exists**, and
a wrong code, an expired code, and an unknown address are deliberately indistinguishable; anything
else turns these endpoints into an account-enumeration oracle. A successful reset **revokes every
refresh token**: if the reset happened because someone else was in the account, leaving their session
alive would defeat the point.

Email goes through `services/mailer.service.js`. Set `RESEND_API_KEY` to send; leave it unset and
codes are logged instead, so the flow is testable without a provider account.

## Streaks

Streaks are **derived, never stored**: a `FeedEntry` with `seenAt` set is the record that a day was
read, so there is no counter to drift out of sync and correcting a day fixes the streak automatically.
`services/streak.service.js` holds the pure logic over `"YYYY-MM-DD"` strings in the user's timezone.

A streak stays alive until a **whole day** is missed — if today hasn't been read yet, the count runs
back from yesterday rather than breaking prematurely.

## Progressive profile

Beyond the core `preferences` (categories, tone, focus), users can enrich an optional **profile**
over time — age band, mood, relationship status, faith, employment, zodiac, practice styles, and more.
Every field is optional and none gates the app. The full field set, its options, which fields are
**sensitive** (GDPR special-category — never led with in a nudge), and which are **crisis-adjacent**
(`care`, routed to gentle curated content) live in one place: `src/config/profileFields.js`. The zod
validator, the Mongoose sub-schema, the completeness score, and the nudge suggestions are all derived
from it, so a new question is a one-line addition there.

`GET /api/profile` returns the stored profile, a 0–100 `completeness` score (core signals + every
counted field), and `suggestions` — the next few unanswered questions, non-sensitive first. Changing
a content-affecting field rebuilds the unseen future feed (today is left as-is), the same way
`preferences` does.

## How affirmations work

Affirmations are **generated ahead of time, never on the read path**. `ensureFeed()` keeps
`FEED_BUFFER_DAYS` of future days scheduled per user; the Today screen is a database read. That is
what makes reads instant, keeps Vertex calls to roughly one per user per fortnight, gives moderation
somewhere to run before anything is stored, and makes the offline feed possible at all.

`GET /api/affirmations/feed` is the offline sync endpoint: it embeds full affirmation text and
returns the user's `today` and `timezone`, so the client picks the right day from its own clock with
the server unreachable.

Generation degrades in stages, and none of them reach the user as an error:

1. The user's own pre-generated pool.
2. A fresh Vertex batch — over-requested, since moderation rejects some.
3. The curated bank in `src/data/curated.js`, preferring the user's categories.

A Vertex outage, a blocked response, a batch that fails moderation, and `AI_ENABLED=false` all land
on step 3. Users whose stated focus touches crisis or clinical ground skip generation entirely and
are served the curated bank — their text is never sent to the model and the topic is never echoed
back at them.

### The prompt and the cache

`src/prompts/affirmation.prompt.js` is split deliberately. `SYSTEM_PROMPT` is the **cacheable
prefix**: identical for every user and every request. `buildUserPrompt()` is the per-request tail
holding everything that varies. A context cache is a shared prefix and cannot hold per-user data, so
never move personalization into `SYSTEM_PROMPT` — it would break caching _and_ create an injection
surface. Editing `SYSTEM_PROMPT` invalidates the cache; bump `PROMPT_VERSION` when you do.

User-supplied focus text is delimiter-wrapped, labelled as data, newline-collapsed, and truncated
before it reaches the model. There are tests for the forgery cases.

Explicit caching is off by default (`AI_EXPLICIT_CACHE`) because it bills per token-hour whether or
not it is hit, while 2.5 models cache a repeated prefix implicitly at no storage cost. Turning it on
is a config change, not a code change.

## How auth works

Access tokens are short-lived JWTs (`ACCESS_TOKEN_TTL`, default 15m) sent as
`Authorization: Bearer <token>`. Refresh tokens are opaque 48-byte random strings; only their
SHA-256 is stored, so a database dump yields no usable sessions.

Refresh tokens rotate: every refresh mints a successor in the same **family** and marks the
predecessor as rotated. Presenting an already-rotated token means a replay or a stolen token, and we
can't tell which — so the entire family is revoked and the user has to sign in again. That behaviour
is covered by a test; don't "fix" it into a silent re-issue.

`requireAuth` re-reads the user on every request instead of trusting the token body, so a deleted
account stops working immediately rather than at token expiry.

## Conventions

- Throw `AppError.badRequest(...)` / `.unauthorized(...)` etc. for anything the client should see.
  Anything else that escapes a handler is treated as a bug: logged with a stack, returned as a bare 500.
- Validate every request body with a zod schema in `src/validators/` via the `validate()` middleware.
  Schemas are `.strict()`, so unknown fields are a 400 rather than something to silently ignore.
- Never add a secret-bearing field without adding it to the `redact` list in `src/lib/logger.js`.
- Mongoose has no migrations, so schema and index changes go in `migrations/NNN-name.js` exporting
  `async up(db)`. Write them idempotently — an interrupted run leaves work done but unrecorded.
- `autoIndex` is off in production; indexes are created by migrations only.

## Layout

```
src/
  app.js              createApp() — middleware wiring, no listen
  index.js            boot: connect DB, listen, graceful shutdown
  config/env.js       zod-validated env, exits at boot on bad config
  config/db.js        mongoose connect/disconnect
  models/             User, RefreshToken
  services/           token.service.js — sign, issue, rotate, revoke
  controllers/        request handlers
  routes/             routers + rate limits
  middleware/         auth, validate, error
  validators/         zod request schemas
  lib/logger.js       pino, with redaction
migrations/           NNN-*.js + run.js
tests/                vitest + supertest
```
