# App Privacy questionnaire — answers that match the code

App Store Connect asks what the app collects, whether it is linked to the
user, and whether it is used for tracking. These answers are derived from what
the code actually does, not from a template — the sources are cited so a
future change knows to update this.

**Global answers:** no data is used for **tracking** (there is no ads SDK, no
analytics SDK, no fingerprinting — nothing to track *with*). Everything below
is **linked to identity** (it hangs off the account) and used for **App
Functionality** only.

## Declare these

| ASC category | ASC type | What it actually is | Source of truth |
| --- | --- | --- | --- |
| Contact Info | Name | First/last name at signup; first name may greet you on Today | `User.js` |
| Contact Info | Email Address | Sign-in, verification, password reset | `User.js`, `mailer.service.js` |
| User Content | Other User Content | Profile answers (mood, focus free-text), My Words affirmations, favourites and bookmarks, voice notes stay on-device | `User.profile`, `Affirmation`, `Favorite`, `Saved` |
| Identifiers | User ID | The account id; also the app-user id handed to RevenueCat | `AuthContext`, `lib/purchases.js` |
| Purchases | Purchase History | Subscription status from the store via RevenueCat — never card details | `subscription.service.js` |
| Usage Data | Product Interaction | Days read and streaks, stored server-side per account | `streak.service.js`, `FeedEntry` |

## Explicitly NOT collected — answer "no" with confidence

- **Location** — never requested.
- **Contacts, Photos, Files** — never requested. (Share/export writes *out*
  through the OS share sheet; nothing is read.)
- **Health & Fitness** — nothing integrates with HealthKit.
- **Browsing/Search History** — no web views, no search.
- **Diagnostics / Crash Data** — there is no crash SDK in the app today. **If
  Sentry is ever added, this page and the ASC answers must change first.**
- **Advertising Data / Other IDs** — no ad SDK, IDFA never requested, so no
  App Tracking Transparency prompt is needed either.

## Third parties (for your own reference, not an ASC field)

Processors receiving data, and only what their job needs: MongoDB Atlas
(storage), Google Vertex (profile context for generation), ElevenLabs
(affirmation *text* only — names are stripped before rendering, enforced in
`spoken.service.js` and the generation prompt), RevenueCat (subscription
events), Resend (account email). Same list the privacy policy names.
