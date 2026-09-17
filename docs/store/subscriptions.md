# Subscriptions, paste-ready

Two products, one group, three places they have to agree: App Store Connect,
Play Console, RevenueCat. Nothing here lives in code — `grep` for a price in
this repo returns nothing on purpose, because the store is the authority on what
something costs in a given country and a literal is wrong everywhere but one.

## The identifiers

Use the same strings on both platforms. Play Console is the stricter of the
two (lowercase, digits, underscores and periods only, must start with a letter
or digit), so these satisfy both:

| What    | Product ID               |
| ------- | ------------------------ |
| Monthly | `saydle_premium_monthly` |
| Annual  | `saydle_premium_annual`  |

The app never names them. `lib/purchases.js` reads
`offerings.current.availablePackages`, so RevenueCat's offering decides what the
paywall shows. The IDs only need to be consistent, not meaningful.

## App Store Connect

**Both subscriptions go in one subscription group.** This is the setting people
get wrong and it is not cosmetic: subscriptions in the same group are mutually
exclusive and Apple handles upgrade, downgrade and proration between them. In
separate groups a customer can buy monthly _and_ annual and be charged for both.

App → **Subscriptions** → create a group:

- Reference Name: `Saydle Premium`

Then inside it, two subscriptions:

| Field          | Monthly                  | Annual                  |
| -------------- | ------------------------ | ----------------------- |
| Reference Name | `Saydle Premium Monthly` | `Saydle Premium Annual` |
| Product ID     | `saydle_premium_monthly` | `saydle_premium_annual` |
| Duration       | 1 Month                  | 1 Year                  |
| Price          | **$9.99**                | **$49.99**              |

Each needs a localization (App Store Display Name and Description) before it can
be submitted. English (U.K.) matches the rest of the listing:

- Monthly display name: `Saydle Premium, Monthly`
- Annual display name: `Saydle Premium, Annual`
- Description, both: `Affirmations written for you, not for everyone.`

**The description is capped at 55 characters**, which is tighter than it looks
and is not stated until the field turns red. That leaves room for the two
features someone is actually deciding between paying for: the personalised
generation and the listening session. The shelf and My Words do not fit, and
are not why anyone subscribes.

**The first subscription submission also needs a review screenshot** of the
paywall, at a supported device size. The six shots in `docs/store/screenshots/`
are the listing set and none of them is the paywall, so this one has to be
captured. Do it after RevenueCat's offering is live, or the paywall renders
with no prices on it.

### The 5:1 ratio is deliberate

$49.99 rather than the $79.99 the Test Store carried, and rather than the $39.99
the raw margin allows. "I Am", which Saydle is modelled on, sits around $20–30 a
year, while Calm and Headspace are ~$70: $79.99 asked Calm's price with a
fraction of Calm's catalogue. Monthly's job is to make annual obvious.

## RevenueCat

Once the products exist in App Store Connect:

1. **Product catalog → Products** → import or add both, attached to the
   `Saydle (App Store)` app.
2. **Entitlements** → the entitlement's **identifier** is `premium`; its display
   name is `Saydle Premium`. Attach both products. Only the identifier is the
   contract, and it deliberately has no space: a value with one has to be quoted
   in `.env`, and a host that takes values literally ships the quotes as part of
   the string. A mismatch means
   `entitlements.active[ENTITLEMENT_ID]` is forever `undefined`: nobody is
   entitled, every paying customer sees the paywall, and nothing logs an error
   anywhere. `eas.json` carried `premium` until 2026-09-11 for this reason.
3. **Offerings** → the offering marked **current** gets two packages:
   - `$rc_monthly` → `saydle_premium_monthly`
   - `$rc_annual` → `saydle_premium_annual`

   The paywall renders whatever `offerings.current.availablePackages` returns, so
   an offering that is not marked current produces an empty paywall with no error.

## No free trial

The paywall is hard. Do not add an **Introductory Offer** to either product.

This is the product decision, and the code already matches it: `isEntitled` in
`services/subscription.service.js` returns true only for `status === "active"`,
the onboarding paywall has no skip path, and nothing anywhere grants access
without a purchase. A free reader gets the curated bank; everything written for
them personally is behind the subscription.

Adding a trial in App Store Connect would therefore be the only thing granting
one, silently and outside the server's knowledge.

## Apple Small Business Program

Enrol before listing. Under $1M a year it drops Apple's cut from 30% to 15%,
worth about $7.50 per annual subscriber. Then record the enrolment date on the
App Store app in RevenueCat so its revenue reporting is not overstating the fee.

## Play Console

Same two product IDs, same prices, under **Monetise → Products →
Subscriptions**. Play calls the container a "subscription" with "base plans"
rather than a group: one subscription per product, each with a single base plan
(monthly / annual, auto-renewing).

Play cannot be configured until the app exists in Play Console, which is also
what gates the service account, the `goog_` key, and the 14-day closed test.
