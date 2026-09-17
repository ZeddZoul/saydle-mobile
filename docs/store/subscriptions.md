# Subscriptions, paste-ready

Two products, one group, three places they have to agree: App Store Connect,
Play Console, RevenueCat. Nothing here lives in code — `grep` for a price in
this repo returns nothing on purpose, because the store is the authority on what
something costs in a given country and a literal is wrong everywhere but one.

## The identifiers

Use the same strings on both platforms. Play Console is the stricter of the
two (lowercase, digits, underscores and periods only, must start with a letter
or digit), so these satisfy both:

| What    | Product ID           |
| ------- | -------------------- |
| Monthly | `saydle_pro_monthly` |
| Annual  | `saydle_pro_annual`  |

The app never names them. `lib/purchases.js` reads
`offerings.current.availablePackages`, so RevenueCat's offering decides what the
paywall shows. The IDs only need to be consistent, not meaningful.

## App Store Connect

**Both subscriptions go in one subscription group.** This is the setting people
get wrong and it is not cosmetic: subscriptions in the same group are mutually
exclusive and Apple handles upgrade, downgrade and proration between them. In
separate groups a customer can buy monthly _and_ annual and be charged for both.

App → **Subscriptions** → create a group:

- Reference Name: `Saydle Pro`

Then inside it, two subscriptions:

| Field          | Monthly              | Annual              |
| -------------- | -------------------- | ------------------- |
| Reference Name | `Saydle Pro Monthly` | `Saydle Pro Annual` |
| Product ID     | `saydle_pro_monthly` | `saydle_pro_annual` |
| Duration       | 1 Month              | 1 Year              |
| Price          | **$9.99**            | **$49.99**          |

Each needs a localization (App Store Display Name and Description) before it can
be submitted. English (U.K.) matches the rest of the listing:

- Monthly display name: `Saydle Pro, Monthly`
- Annual display name: `Saydle Pro, Annual`
- Description, both: `Affirmations written for you, the listening session, your
shelf, and My Words.`

**The first subscription submission also needs a review screenshot** of the
paywall, at a supported device size. `docs/store/screenshots/` already has the
iPhone set.

### The 5:1 ratio is deliberate

$49.99 rather than the $79.99 the Test Store carried, and rather than the $39.99
the raw margin allows. "I Am", which Saydle is modelled on, sits around $20–30 a
year, while Calm and Headspace are ~$70: $79.99 asked Calm's price with a
fraction of Calm's catalogue. Monthly's job is to make annual obvious.

## RevenueCat

Once the products exist in App Store Connect:

1. **Product catalog → Products** → import or add both, attached to the
   `Saydle (App Store)` app.
2. **Entitlements** → open `Saydle Pro` → attach both products. The identifier
   must stay exactly `Saydle Pro`, with the space. A mismatch means
   `entitlements.active[ENTITLEMENT_ID]` is forever `undefined`: nobody is
   entitled, every paying customer sees the paywall, and nothing logs an error
   anywhere. `eas.json` carried `premium` until 2026-09-11 for this reason.
3. **Offerings** → the offering marked **current** gets two packages:
   - `$rc_monthly` → `saydle_pro_monthly`
   - `$rc_annual` → `saydle_pro_annual`

   The paywall renders whatever `offerings.current.availablePackages` returns, so
   an offering that is not marked current produces an empty paywall with no error.

## The trial is a decision, not a default

There is no server-side trial. `isEntitled` in `services/subscription.service.js`
returns true only for `status === "active"`, the `User` model has no trial field,
and `purge.service.js` reads a `subscription.trialEndsAt` that never exists. The
comment above `STATUSES` in `config/subscription.js` describes a constant that is
no longer there.

So a free trial has to be an **App Store introductory offer**, configured on the
subscription: Introductory Offer → Free Trial → duration. Do not add one on the
assumption the server already grants one.

If you do add it, add it to the **annual** product only. A trial on monthly
mostly converts people who would have paid $9.99 anyway; on annual it is the
thing that makes a $49.99 commitment answerable.

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
