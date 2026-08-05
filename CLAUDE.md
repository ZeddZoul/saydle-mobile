# Saydle

Daily affirmations mobile app. Expo / React Native front end, Node.js backend (to be built).
Product inspiration: the "I am" daily affirmations app (Monkey Taps) on the App Store / Play Store.

## Stack

- **Mobile**: Expo SDK 54, React Native 0.81.5, React 19, expo-router v6 (file-based routing)
- **Language**: JavaScript + JSX. No TypeScript — do not introduce it without asking.
- **Package manager**: pnpm 10 workspace (`nodeLinker: hoisted`), packages: root (mobile) + `server`. Node 24.
- **Backend**: Node.js, Express 5, Mongoose/MongoDB, hand-rolled JWT auth — see [server/README.md](server/README.md).

## Commands

```bash
pnpm start          # expo start
pnpm ios            # expo start --ios
pnpm android        # expo start --android
pnpm web            # expo start --web
pnpm api            # run the backend in watch mode
pnpm api:test       # backend test suite (vitest + in-memory mongo)
pnpm translate es   # machine-translate MISSING locale keys (needs DEEPL_API_KEY)
```

The backend has tests; the mobile app does not yet. Neither half has a linter or formatter
configured — that's still open work.

## Layout

```
app/                    expo-router routes (file-based)
  _layout.jsx           AuthProvider + route guard; redirects on auth state
  index.jsx             landing screen (logo, tagline, Get started / Login)
  (auth)/               login.jsx, register.jsx — wired to the API
  (dashboard)/          Tabs: dashboard / practice / favorites / profile, plus two
                        hidden routes — stream.jsx (the swipeable full-screen feed,
                        opened by tapping today's line) and my-words.jsx (premium)
contexts/AuthContext.jsx  session state, bootstrap, sign in/up/out, delete, outbox flush
hooks/                  useFeed, useFavorites, useStreak, useReminders,
                        useProfileNudge — cache-first data hooks
lib/                    api (fetch + refresh), tokenStore (SecureStore), cache
                        (AsyncStorage), outbox (offline writes), nudges, errors,
                        config, dates, i18n
locales/                en.json, es.json — one file per shipped language
scripts/                build-time Node tools (ESM — see scripts/package.json)
widgets/                native home-screen widget sources (Swift + Kotlin)
components/             Button, FormField, OfflineBanner, CustomView, CustomText, Spacer
styles/                 loginStyles.js, dashboardStyles.js — each exports `Styles`
__tests__/              jest-expo tests mirroring lib/hooks/contexts/screens
assets/                 logo.png (used for icon, splash, favicon)
server/                 Express API — see server/README.md for its own layout
```

## Mobile architecture

- **Auth** lives in `contexts/AuthContext.jsx`. Screens call `useAuth()` — never the
  API client directly for auth. Tokens are in `expo-secure-store` (web falls back to
  AsyncStorage); the offline read cache is in AsyncStorage, namespaced per user id.
- **The network layer distinguishes three failures** (`lib/errors.js`): `ApiError`
  (server said no), `NetworkError` (couldn't reach it), `SessionExpiredError`. Only a
  server-rejected refresh clears the session. A network failure must never sign the
  user out — that is what makes offline work, and it has a regression test.
- **`lib/api.js` refreshes on a single 401 and retries once**, coalescing concurrent
  401s into one refresh so rotation doesn't look like a replay to the server.
- **Data hooks are cache-first**: render cached content immediately, revalidate in the
  background, treat offline-with-content as normal rather than an error. Writes
  (favorite, seen, profile, preferences) are optimistic; a real rejection rolls back, a
  network failure keeps the optimistic state and queues the write in `lib/outbox.js`.
- **The outbox replays offline writes** on sign-in and on every foreground. Ops must be
  idempotent and collapsible by key — favorites supersede, profile/preference patches
  merge. Replay stops at the first `NetworkError`; a write the server *refuses* is dropped
  rather than left to wedge the queue. `AuthContext` bumps `syncToken` after a flush that
  reached the server, and the data hooks refetch on it.
- **i18n is `i18next` + `react-i18next`.** Inside a component use `useT()` from `lib/i18n.js`
  (returns `{ t, tf }`); being subscribed is what makes a language change repaint the app. The bare
  `t`/`tf` exports are for non-component code only. A language is a **gate**, not a preference: it
  ships only with moderation rules, a curated bank, and a locale file — see `saydle-i18n` and
  `server/src/config/locales.js`. English and Spanish are live. `pnpm translate <code>` fills
  *missing* locale keys via DeepL — it never overwrites reviewed text, drops any string whose
  `{{placeholders}}` came back changed, and refuses to touch the curated bank or the moderation
  rules. Treat its output as a first draft.
- **Profile nudges** ask for one more onboarding answer at a time. The cadence
  (`lib/nudges.js`) is pure and deliberately shy: 2-day grace, 3-day cooldown after an
  answer, escalating 4/10/30-day backoff on refusals, then 90 days, and silence above 90%
  personalized. The Profile screen ignores the backoff — someone who went looking should
  find it.
- **Entitlement is server-truth.** The RevenueCat webhook is the only path that may mark a
  subscription verified — a client claiming to have paid is never evidence. `lib/purchases.js`
  is a guarded boundary: no native module (Expo Go) or no key (no store listing) both report
  `available: false`, and the paywall runs on the real server-side trial.
- **Native boundaries follow one pattern** (`lib/notifications.js`, `lib/purchases.js`,
  `lib/widget.js`): lazy `require` in a try/catch, every function returning `{ available: false }`
  rather than throwing. That is what keeps Expo Go working while native features exist.
- **The widget gets a fortnight of affirmations at once**, with every colour resolved, because it
  has no network and no session — see `lib/widgetData.js`. It renders correctly for two weeks
  even if the app is never opened.
- **The stream runs backwards only** (`hooks/useStream.js`): today, then days already read. The
  server schedules weeks ahead so the app works offline, but letting anyone swipe into that buffer
  would turn a daily line into a list to get through.
- **`EXPO_PUBLIC_API_URL`** points the app at the API. It's inlined at build time, so
  never put a secret in any `EXPO_PUBLIC_*` var. Defaults per platform in `lib/config.js`.

## Conventions

- Screens are arrow-function components with a default export at the bottom of the file.
- Shared styles live in `styles/*.js` and are exported as a named `Styles` object; screen-local
  styles use a `const styles = StyleSheet.create({})` at the bottom of the screen file.
- `CustomView` is the standard full-bleed centered page container (pink `#f7cac5d2` background).
- `CustomText` adapts color to `useColorScheme()` — prefer it over bare `<Text>` for body copy.
- `Spacer` takes `height` / `flex` props for vertical rhythm.
- Forms use a single `useState` object plus a curried `handleChange(field)` handler.

## Brand

| Token | Value | Use |
|---|---|---|
| Coral | `#FF6F61` | Primary buttons, links, header |
| Mauve | `#C49EBB` | Input borders, secondary button outline |
| Pink tint | `#f7cac5d2` | Page background (`CustomView`) |
| White | `#FFFFFF` | Text on coral |

## Gotchas

- `@bittingz/expo-widgets` declares **no dependencies** but `require`s `fs-extra` in its config
  plugin, so `expo export`/`prebuild` fails with `Cannot find module 'fs-extra'`. We install
  `fs-extra` ourselves as a devDependency to cover it — don't remove it wondering what it's for.

- React Native ignores `color`, `textAlign`, and `cursor` on a `View`. Several style objects in
  `styles/` set them on containers where they do nothing — don't copy that pattern.
- The root layout sets `headerShown: false` for the `(dashboard)` group, which overrides the
  header options declared inside `app/(dashboard)/_layout.jsx`.
- Never `console.log` a form object that holds a password.
- `expo-router` `href` values are route paths, not group paths: `/login`, not `/(auth)/login`.

## Testing

Every module ships with its own test file, covering the happy path, validation failures, the auth
boundary, and the fallback path. This is a standing expectation, not a per-feature decision — don't
defer tests to a later pass. Mock third-party boundaries (Vertex) rather than skipping the code
around them. Mobile tests: `pnpm test` (jest-expo). API tests: `pnpm api:test` (vitest).

Note on `@testing-library/react-native` v14: `render`, `renderHook`, `fireEvent` and its helpers
(`.press`, `.changeText`) are all **async** — `await` them, or `render` returns before mounting and
queries come back empty. `jest.setup.js` sets `IS_REACT_ACT_ENVIRONMENT`. jest is pinned to v29 to
match jest-expo 57; do not bump it to v30.

## Current state

Full vertical slice, end to end, with tests on both halves (**637 total**: 253 API + 384 mobile).

- **API**: auth (register / login / refresh-with-rotation / logout / delete / password reset /
  email verification), the daily feed with offline sync and backwards history, favorites,
  categories, preferences, the progressive profile, streaks, subscriptions (RevenueCat webhook),
  and user-written affirmations. Affirmations are generated by Vertex ahead of time and degrade to
  the curated bank. `pnpm api:test`.
- **Mobile**: the long onboarding funnel (which *is* signup — the account is created at the end, on
  the paywall), real auth with a route guard, Today, the swipeable full-screen stream, Practice,
  Favorites, Profile with preferences / themes + generative artwork / reminders / language /
  account deletion, "My words" (premium), local reminders, home-screen widgets, English + Spanish,
  progressive-profile nudges, and email verification. Cache-first reads, outbox-backed writes.
  `pnpm test`, and `npx expo export` bundles clean.

The app needs a running API (`pnpm api`) and `EXPO_PUBLIC_API_URL` pointing at it.

## What's left

The roadmap is complete. What remains is not code:

- **Fill the env vars** in `.env.example` — RevenueCat keys, `APPLE_TEAM_ID`, `DEEPL_API_KEY`,
  `RESEND_API_KEY`, and the Vertex project (`AI_ENABLED=false` until then).
- **A native build** for widgets and IAP: `npx expo prebuild && npx expo run:ios`. Neither works
  in Expo Go, by design of the platform.
- **A native Spanish read** of `locales/es.json`, the curated `es` bank, and the moderation rules.
- **Real testimonials** — the landing quotes are still marked PLACEHOLDER, and the paywall price
  line is hardcoded rather than read from the store's own localized price.
