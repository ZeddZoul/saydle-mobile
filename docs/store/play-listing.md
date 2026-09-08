# Play Store listing, paste-ready

Every field maps to a box in the Play Console. Assets are already in this
folder: `feature-graphic.png` (the required 1024x500) and
`screenshots/play/` (1080x1920; the iPhone set is 2.17:1, which Play rejects,
so these are scaled and padded to fit its 2:1 limit).

## Store presence

| Field                  | Value                                                                        |
| ---------------------- | ---------------------------------------------------------------------------- |
| App name (30)          | `Saydle: Daily Affirmations`                                                 |
| Short description (80) | `A new affirmation every morning, written for you and read in a calm voice.` |
| Category               | Lifestyle                                                                    |
| Tags                   | Self care, Wellness                                                          |
| Contact email          | `support@saydle.com`                                                         |
| Website                | `https://saydle.com`                                                         |
| Privacy policy         | `https://saydle.com/privacy`                                                 |

## Full description (4000 max, ~1600 here)

> Some mornings need a steadier voice.
>
> Saydle gives you one new affirmation every day. Tell it a little about
> yourself and it writes them for you: what you are working on, how you have
> been, the tone that suits you. Not the same lines everyone gets.
>
> READ ONE, KEEP THE ONES THAT LAND
> Swipe through today's lines. Heart the ones that land. Bookmark the ones you
> mean to come back to; they wait on your shelf.
>
> LISTEN INSTEAD
> Practice reads today's seven most personal lines aloud, one at a time, with
> room to breathe between them. Choose the voice that helps: fatherly, mentor,
> alongside you, motherly, or grandfatherly. A voice change takes effect
> tomorrow, so today's session stays whole.
>
> MAKE IT YOURS
> Six hand drawn themes. A home screen widget that keeps two weeks of
> affirmations ready, even offline. Gentle local reminders at times you
> choose. Write your own lines in My Words and meet them again in your feed.
>
> QUIET BY DESIGN
> No ads. No tracking. No feed of other people. Saydle works offline, asks for
> one small thing at a time, and deletes your account properly when you ask,
> with a 30 day window to change your mind.
>
> Saydle is a wellbeing companion, not a medical or mental health service.
>
> Saydle Premium unlocks affirmations written personally for you, the
> listening session, your shelf, and My Words. Monthly or annual; renews
> automatically unless cancelled in your Google Play subscriptions at least 24
> hours before the period ends.
>
> Terms: https://saydle.com/terms

## Data safety form

Play's questionnaire, answered to match the code. Everything collected is
**encrypted in transit**, **deletable on request** (in app), used for **app
functionality** only, **never shared**, and **not used for advertising**.

| Play category                                                      | Collected? | What                                                                   |
| ------------------------------------------------------------------ | ---------- | ---------------------------------------------------------------------- |
| Personal info → Name                                               | Yes        | Account name                                                           |
| Personal info → Email                                              | Yes        | Sign in, verification, reset                                           |
| Messages / Other user content                                      | Yes        | Profile answers, My Words, favourites, bookmarks                       |
| Financial info → Purchase history                                  | Yes        | Subscription status only, via Google Play; card details never reach us |
| App activity → App interactions                                    | Yes        | Days read, streaks                                                     |
| App info and performance (crash logs, diagnostics)                 | **No**     | No crash or analytics SDK is in the app                                |
| Location, Contacts, Photos, Files, Health, Web history, Device IDs | **No**     | Never requested                                                        |

Account creation: yes, required. Account deletion: available in app
(Profile → Delete account) and by email; deletion URL for the form:
`https://saydle.com/privacy` (describes the 30 day grace).

## Content rating (IARC questionnaire)

Answer **No** throughout: no violence, sexuality, language, controlled
substances, gambling, hate speech, user interaction, user generated content
shared with others, location sharing, or unrestricted internet. My Words is
private to its author, which is why "users can interact" and "UGC visible to
others" are honest No's. Expected result: Everyone / PEGI 3.

## The gate nobody can skip

A new personal developer account must run a **closed test with at least 12
testers for 14 continuous days** before production access. Start it the day
the first APK exists:

1. Play Console → Testing → Closed testing → create track, upload the `.aab`
   (`pnpm build:aab`) or APK.
2. Add a tester email list; send the opt in link to your 12.
3. They install once and keep it installed; the clock runs on its own.
4. After 14 days, apply for production from the console.

Everything above (listing, data safety, rating) can be filled while the clock
runs. The webhook URL in RevenueCat must point at the deployed API before
testers purchase anything.
