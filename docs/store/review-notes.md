# App Review notes + demo account

Paste the "Notes for the reviewer" block into App Store Connect → App Review
Information. Fill the demo credentials _after_ creating the account on the
production database — a reviewer signing into an account that only exists on a
laptop is an instant rejection.

## Demo account (create on PROD after the API deploys)

```
email:    review@saydle.com        (or any address you control)
password: <set one, paste it into ASC — never commit it>
```

Create it through the app itself against the deployed API (run the onboarding
once). Skipping email verification is fine: the app treats verification as a
banner, never a wall. `support@saydle.com` has a catch-all forwarder, so any
address at the domain reaches you.

Then entitle it, which is **not optional**. The paywall is hard: a reviewer who
cannot complete a purchase sees only the curated bank, never Practice, the
shelf, My Words or the listening session — most of what the listing describes —
and rejects the app for features they could not reach.

```bash
pnpm --filter @saydle/server entitle review@saydle.com --days 365
```

It writes `source: promotional` and leaves `verifiedAt` null, so the billing
screen honestly reads "not confirmed": no store was ever asked. Revoke with
`--revoke` once review is done. Run it with `MONGODB_URI` pointing at
production; the script prints which database it touched, because the likeliest
mistake is entitling an account on a laptop.

## Notes for the reviewer (paste as-is, fill the blanks)

> Saydle is a daily-affirmations app. A demo account with an active
> subscription is provided above.
>
> WHERE THINGS ARE
> • Today's affirmation appears on the first screen after sign-in; swipe up
> for more lines.
> • Practice (bottom of the Today screen) reads today's seven lines aloud —
> device volume needs to be up; each line plays, rests, then advances.
> • The home-screen widget is under the app's name in the widget gallery; it
> updates from the app and holds two weeks of content offline.
> • Account deletion is in Profile → Delete account (30-day grace period,
> cancellable by signing back in — described in the privacy policy).
>
> SUBSCRIPTIONS
> The paywall appears at the end of onboarding for new accounts. Prices are
> the store's own localized prices. Terms and privacy policy are linked
> directly beneath the purchase buttons.
>
> ONE HONEST NOTE
> Generated affirmations are written server-side a day ahead. A brand-new
> account receives its first personalized batch within a minute of signup;
> until then the app serves from its human-written bank, which is the intended
> behaviour, not a failure.

## Things a reviewer may poke — and what happens

| They try                               | What happens                                                                                                           |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Airplane mode after first load         | Cached feed still reads; banner says offline; writes queue and replay                                                  |
| Subscribe, then reopen paywall         | "Upgrade" path stays available; restore purchases works (`billing`)                                                    |
| Delete account, sign back in           | Deletion cancelled, stated plainly                                                                                     |
| Type medical/crisis text into My Words | Accepted and stored — Saydle does not moderate a user's private words, and the terms state it is not a medical service |
| The widget with the app force-quit     | Keeps rendering; it holds a fortnight of lines                                                                         |

## Submission-day checklist (the order that avoids re-review)

1. API deployed, `/healthz` shows `"db":true`; legal URLs resolve publicly.
2. `eas.json`: real `EXPO_PUBLIC_API_URL`, real `appl_` key, `APPLE_TEAM_ID`.
3. Subscriptions created in ASC ($9.99 monthly / $49.99 annual), attached in
   RevenueCat, entitlement identifier exactly `Saydle Pro`.
4. **Submit the subscriptions WITH the app version** — first-time IAPs are
   reviewed together; submitting the binary alone leaves the paywall dead.
5. One sandbox purchase completed end to end on a TestFlight build.
6. Demo account created on prod + made premium; credentials into ASC.
7. Screenshots uploaded (6.9" set; `docs/store/screenshots/`).
8. Privacy questionnaire per `privacy-labels.md`; age rating per `listing.md`.
9. Small Business Program enrollment submitted (separate from review).
