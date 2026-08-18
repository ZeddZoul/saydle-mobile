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
pnpm ios            # expo run:ios      (native build; sets LANG for CocoaPods)
pnpm android        # expo run:android
pnpm prebuild       # expo prebuild     (add --clean to regenerate ios/ + android/)
pnpm pod            # pod install in ios/
pnpm web            # expo start --web
pnpm api            # run the backend in watch mode
pnpm test           # mobile test suite (jest-expo)
pnpm api:test       # backend test suite (vitest + in-memory mongo)
pnpm lint           # eslint (CI runs it with --max-warnings 0)
pnpm format         # prettier --write; `format:check` is what CI gates on
pnpm translate es   # machine-translate MISSING locale keys (needs DEEPL_API_KEY)
```

Both halves have tests, and `.github/workflows/ci.yml` gates every PR on lint, format,
both suites, and a clean `expo export`. Run `pnpm format` before committing — a formatting
diff fails the build ahead of the test steps, so it masks whatever comes after it.

Never pass `--` before a flag in these scripts: `pnpm test -- --ci` reaches jest as a
positional test-path _pattern_, matches no files, and exits 1. Write `pnpm test --ci`.

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
  merge. Replay stops at the first `NetworkError`; a write the server _refuses_ is dropped
  rather than left to wedge the queue. `AuthContext` bumps `syncToken` after a flush that
  reached the server, and the data hooks refetch on it.
- **i18n is `i18next` + `react-i18next`.** Inside a component use `useT()` from `lib/i18n.js`
  (returns `{ t, tf }`); being subscribed is what makes a language change repaint the app. The bare
  `t`/`tf` exports are for non-component code only. A language is a **gate**, not a preference: it
  ships only with moderation rules, a curated bank, and a locale file — see `saydle-i18n` and
  `server/src/config/locales.js`. English and Spanish are live. `pnpm translate <code>` fills
  _missing_ locale keys via DeepL — it never overwrites reviewed text, drops any string whose
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
- **Reads never wait for the model.** `ensureFeed` fills missing days from the reader's own
  generated pool and then the curated bank — database work only, ~90ms — and hands anything the
  model must produce to `scheduleReplenish`, which is deliberately not awaited. `replenish` then
  tops the pool up and re-points _future, unseen_ days that are holding curated lines at the fresh
  ones. Today is never swapped mid-read, and a day already seen is history and is never rewritten.
  Registration kicks a replenish too, so the funnel absorbs the first batch. This is not a
  micro-optimisation: generating inline made a new account's first request take **20.2s** against
  a 15s client timeout, so the work completed and the reader was told "Could not reach Saydle".
  `flushReplenish()` awaits in-flight work — tests need it, since asserting straight after a
  request otherwise asserts against work that has not started and passes for the wrong reason.
- **Only one instance may generate for a reader at a time.** The in-process `inFlight` map dedupes
  the two requests every cold launch fires; the authority is `user.replenishingUntil`, claimed with
  one atomic `findOneAndUpdate` so a second server behind a load balancer cannot bill us for the
  same batch. It is a _deadline_, not a flag — a process killed mid-batch would otherwise lock that
  reader out of generation permanently. The claim is only attempted once a cheap count says there
  is work, so an ordinary read performs no write at all.
- **The chrome floats; the navigator draws nothing.** `(dashboard)/_layout.jsx` passes
  `tabBar={() => null}` — a _Navigator_ prop, not a screen option, and putting it in
  `screenOptions` is silently ignored. Today carries `FloatingChrome` (profile / kept-meter /
  premium above, favourites / practice / themes below); every other screen carries
  `FloatingHeader`, which is the only way back now that the tab bar is gone. Both overlay rather
  than occupy, so scrolling content must reserve `FLOATING_HEADER_INSET` — and that `paddingTop`
  has to be declared _after_ any `padding` shorthand in the same style object, or the shorthand
  resets it.
- **A paged list must take its page height from state, never a ref.** `getItemLayout` says where
  each page starts and the page style says how tall it is; a ref updated in `onLayout` lands
  without a re-render, so rendered pages keep the old height while `getItemLayout` reports the new
  one. Paging accumulates offsets, so the content walks further down the screen with every swipe
  until it leaves entirely. `__tests__/screens/library.test.jsx` pins both readings together.
- **The library is premium and separate from the daily line.** One ordered batch per reader
  (`Affirmation.library: true`), a cursor on the user as the whole of seen-state, refilled when the
  unread tail runs low. `takeAffirmations` excludes library rows: retiring a batch deletes what
  nobody kept, which would otherwise rewrite a day already lived. The paywall is one `gate()` in
  `library.controller.js` reading `REQUIRES_PREMIUM` — see `config/library.js`.
- **`.lean()` skips `toJSON`.** The library reads lean for speed, so responses are shaped by hand
  (`publicLine`): without it the payload carries `_id` instead of `id` — breaking list keys and
  sending `undefined` when a line is favourited — and ships `user`, `textKey` and `__v` to the
  client.
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

| Token     | Value       | Use                                     |
| --------- | ----------- | --------------------------------------- |
| Coral     | `#FF6F61`   | Primary buttons, links, header          |
| Mauve     | `#C49EBB`   | Input borders, secondary button outline |
| Pink tint | `#f7cac5d2` | Page background (`CustomView`)          |
| White     | `#FFFFFF`   | Text on coral                           |

## Pricing

**$9.99/month, $49.99/year.** Both set in the RevenueCat dashboard, never in code —
`grep` for a hardcoded price should return nothing, because the store is the authority on
what something costs in a given country and a literal is wrong everywhere but one.

$49.99 rather than the $79.99 the Test Store was configured with, and rather than the
$39.99 the raw margin allows. The category anchors it: "I Am", which Saydle is modelled
on, sits around $20–30/year, while Calm and Headspace are ~$70 — $79.99 asked Calm's price
with a fraction of Calm's catalogue. $49.99 clears both, and leaves ~60% margin even on
the worst ElevenLabs tier, where $39.99 gets thin once Practice's voice ships.

The 5:1 monthly-to-annual ratio is deliberate. Monthly's job is to make annual obvious.

Measured COGS per subscriber per month: generation ~$0.12 (240-line batches, thinking
capped), TTS $0.76–1.89 depending on tier, infra ~$0.25. **Voice is 10–20x the AI cost** —
it is the only line that scales with engagement, which is why the cache is keyed on
`(text, voiceId)` and a voice change only takes effect the next day.

**Enrol in the Apple Small Business Program before listing.** Under $1M/year it drops the
store cut from 30% to 15%, worth more than every cost optimisation in this file combined.

## Gotchas

- **A RevenueCat `test_` key must never reach a release build.** That prefix is the Test Store —
  real-looking purchases with no App Store Connect or Play Console behind them, which is how the
  purchase flow gets exercised before there is a listing. Two consequences, and the second is
  worse: the SDK refuses one outside development by showing an alert and terminating, and — in
  RevenueCat's own words — "apps submitted with a Test Store API key will be rejected during App
  Review". `EXPO_PUBLIC_*` is inlined **at build time**, so the machine's `.env` is what ships: a
  release cut with the test key in place carries both. `usableKey()` in `lib/purchases.js`
  withholds it when `__DEV__` is false so the boundary degrades to the trial instead — a seatbelt
  against the crash, and no help at all against the rejection. Swap in the `appl_`/`goog_` keys
  before building for submission.
- **`Failed to assemble ui_config` is expected and permanent — do not chase it.** The SDK fetches
  the _hosted Paywall_ config blob at launch (missing keys: `app`, `custom_variables`,
  `localizations`, `variable_config`). We do not use RevenueCat's hosted paywalls — `billing.jsx`
  is our own — so there is nothing in the dashboard for it to assemble and there never will be.
  It is not about Customer Center: that works with the warning present, which was verified on
  device, and configuring Customer Center leaves the warning byte-identical.
- **The entitlement _identifier_ is the contract, not its display name.** `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID`
  and `REVENUECAT_ENTITLEMENT_ID` must both equal the identifier in the RevenueCat dashboard
  (`premium`). A dashboard entitlement named "Saydle Pro" whose identifier is anything else means
  `entitlements.active[ENTITLEMENT_ID]` is forever undefined: nobody is entitled, every paid user
  sees the paywall, and nothing logs an error anywhere.
- **`pod install` needs a UTF-8 locale**, and the reason is worth knowing because the error names
  the wrong thing. With `LANG` unset the locale falls back to `C`; Ruby then refuses to assume a
  character encoding for OS paths and tags the string from `Dir.pwd` as **`ASCII-8BIT`** — note
  that `default_external` and `filesystem` are still `US-ASCII`, so checking those suggests
  nothing is wrong. CocoaPods calls `.unicode_normalize` on that path in `config.rb`
  (`installation_root`), which refuses ASCII-8BIT, and it dies with
  `Encoding::CompatibilityError` before it ever reads the Podfile. The stack appears twice
  because the error _reporter_ re-enters the same call. The `ios` / `prebuild` / `pod` scripts in
  `package.json` set `LANG`/`LC_ALL` themselves, so use those rather than bare
  `npx expo prebuild` — a shell profile export fixes one machine, the scripts fix everyone's.
- **`[Xcodeproj] Consistency issue: no parent for object` means a stale `ios/`, not a bad edit.**
  The widget config plugin re-registers its sources on every prebuild, and against an existing
  `ios/` those accumulate until a file sits in two `SourcesBuildPhase`s and `pod install` fails in
  the post-install hook. `ios/` and `android/` are generated and gitignored, so the fix is
  `pnpm prebuild --clean` — never hand-editing the pbxproj.
- The widget's **App Group is fixed by the plugin** as `group.<bundleId>.expowidgets` and is not
  read from config. `lib/widget.js`, `widgets/ios/SaydleShared.swift`, and `app.json` must all use
  it — a mismatch fails silently, with a widget that simply never updates.
- **Editing `widgets/` and rebuilding does nothing.** The widget sources are copied into
  `ios/saydlemobileWidgetExtension/` (and `android/`) by the config plugin **at prebuild time**, so
  `npx expo run:ios` alone recompiles the _previous_ copy. Always
  `npx expo prebuild` before `run:ios` after touching anything in `widgets/`. There is no error —
  the build succeeds and the widget simply keeps its old appearance, which reads exactly like a
  layout fix that did not work. Check with
  `diff widgets/ios/SaydleWidget.swift ios/saydlemobileWidgetExtension/SaydleWidget.swift`.
- `widgets/ios/Module.swift` **is the Expo module** (it replaces the plugin's own
  `ExpoWidgetsModule.swift`, which on iOS is an empty placeholder). Shared widget code goes in
  `SaydleShared.swift`; only files other than `Module.swift` are compiled into the extension.

- `@bittingz/expo-widgets` declares **no dependencies** but `require`s `fs-extra` in its config
  plugin, so `expo export`/`prebuild` fails with `Cannot find module 'fs-extra'`. We install
  `fs-extra` ourselves as a devDependency to cover it — don't remove it wondering what it's for.

- **A custom font cannot be declared into an Android app widget — it has to be drawn.** Two routes
  look right and both silently render Roboto: `android:fontFamily="@font/fraunces_semibold"` in the
  layout (the font _is_ in the APK — `unzip -l` confirms it — but the launcher inflates RemoteViews
  in its own process and drops the resource), and a `TypefaceSpan` carrying a real `Typeface`
  (`TypefaceSpan.writeToParcel` serialises only the _family name_, so the typeface never survives
  the parcel). Both were measured on a device. `SaydleWidgetProvider` therefore draws the whole
  card — gradient, glow, wordmark, quote, affirmation — into one bitmap with Canvas, which is the
  only surface where our `Typeface` is unambiguously ours, and keeps plain TextViews as a hidden
  fallback for when the bitmap cannot be built. Do not "simplify" it back to XML.
- **Never point Saydle at `gcloud auth application-default login`.** ADC is one global file
  (`~/.config/gcloud/application_default_credentials.json`) shared by every project on the
  machine, and `gcloud config configurations` do _not_ isolate it — only the CLI's account and
  project. Logging in for another project therefore takes Vertex here down with a 403, which the
  service swallows and degrades to the curated bank, so the app keeps working and quietly stops
  being an AI product. `GOOGLE_APPLICATION_CREDENTIALS` is read per process and wins over ADC,
  which is why the key is the local setup too, not just the production one.
- **Gemini 2.5 Flash bills thinking as output.** Measured on a real batch: ~846 prompt tokens,
  ~114 visible output tokens, and **~975 thinking tokens** — thinking is roughly nine tenths of
  what we pay for. It also comes out of `maxOutputTokens`, so a tight budget yields
  `finishReason: MAX_TOKENS` with an _empty_ candidate, which `vertex.service.js` reports as
  "returned no text (likely blocked)" and silently degrades to the bank. 4096 is deliberate
  headroom, not a guess. A `thinkingConfig.thinkingBudget` would cut cost sharply if volume
  ever justifies it.
- **The app icons are generated, not drawn by hand.** `assets/icon.png` (full-bleed),
  `adaptive-icon.png` (transparent foreground) and `monochrome-icon.png` come from
  `scripts/icons.html` rendered through headless Chrome, which is how the wordmark gets real
  Fraunces rather than a lookalike — the old `assets/logo.png` was set in some other face
  entirely, which is why the splash never matched the landing screen. The sizing constraint that
  matters: Android shows only the central 72dp of the 108dp adaptive canvas and guarantees only a
  66dp circle, so a ~3:1 wordmark has to fit that circle **by its diagonal**. Anything above
  ~176px on a 1024px canvas loses the S and the e on a round launcher. Re-render and eyeball it
  against the guide circle rather than trusting the arithmetic.
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

Full vertical slice, end to end, with tests on both halves (**641 total**: 253 API + 388 mobile).
Verified on a native iOS dev build, not just in Expo Go — including the home-screen widget
rendering real data in the active theme, at both small and medium sizes.

Android has now been built and run too (`Pixel_9_Pro` emulator, API 36): sign-in, Today, the
generated affirmation, and the home-screen widget showing the same line as the app, read from
`<packageName>.widgetdata`. The widget is drawn rather than laid out, which is what gets Fraunces
and the gradient onto it — see Gotchas. Artwork softness is bought per platform: iOS blurs the
field in one `BlurView`, Android fades each shape out at its own edge (`softFill` in
`ThemeArtwork`), because a full-screen blur behind every screen is far more expensive there.

- **API**: auth (register / login / refresh-with-rotation / logout / delete / password reset /
  email verification), the daily feed with offline sync and backwards history, favorites,
  categories, preferences, the progressive profile, streaks, subscriptions (RevenueCat webhook),
  and user-written affirmations. Affirmations are generated by Vertex ahead of time and degrade to
  the curated bank. `pnpm api:test`.
- **Mobile**: the long onboarding funnel (which _is_ signup — the account is created at the end, on
  the paywall), real auth with a route guard, Today, the swipeable full-screen stream, Practice,
  Favorites, Profile with preferences / themes + generative artwork / reminders / language /
  account deletion, "My words" (premium), local reminders, home-screen widgets, English + Spanish,
  progressive-profile nudges, and email verification. Cache-first reads, outbox-backed writes.
  `pnpm test`, and `npx expo export` bundles clean.

The app needs a running API (`pnpm api`) and `EXPO_PUBLIC_API_URL` pointing at it.

## What's left

The 13-item roadmap is complete and verified on device. What remains:

- **Fill the remaining env vars** in `.env.example` — RevenueCat keys and `APPLE_TEAM_ID`.
  JWT secrets, Resend, DeepL and Vertex are all filled and exercised.
- **Both bundle identifiers are still `com.anonymous.*`.** Changing `ios.bundleIdentifier` also
  moves the widget's App Group (`group.<bundleId>.expowidgets`), so that path needs re-verifying
  afterwards. The display name and icon are done — `expo.name` is `Saydle`, and the icons are
  generated wordmarks in Fraunces (see below).
- **A real purchase has never been made** — only the trial path is exercised. Needs a store listing
  and a sandbox tester.
- **Vertex is deploy-ready but undeployed.** Generation runs as
  `saydle-api@saydle-web.iam.gserviceaccount.com` (`roles/aiplatform.user`, nothing else), via
  `GOOGLE_APPLICATION_CREDENTIALS` in `server/.env`. On a Google host, attach that service account
  to the service and drop the variable — no key file at all.

Deliberately left as-is (the owner's call, not oversights):

- **Spanish stays unreviewed by a native speaker.**
- **Testimonials stay PLACEHOLDER**, and the paywall price line stays hardcoded rather than read
  from the store's localized price.
