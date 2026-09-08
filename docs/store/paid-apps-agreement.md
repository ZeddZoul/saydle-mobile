# Paid Applications agreement, banking, and tax — the walkthrough

Nothing sells — sandbox or production — until this is done, and only the
**Account Holder** (the Apple ID that enrolled in the Developer Program) can do
it. Every step happens at [appstoreconnect.apple.com](https://appstoreconnect.apple.com).

Budget 20 minutes of clicking and up to a few days of Apple processing. Have
ready: your bank's account number/IBAN and SWIFT/BIC, and your legal name
exactly as the bank holds it.

## 1. Accept the agreement

1. App Store Connect → **Business** (older accounts see "Agreements, Tax, and
   Banking").
2. Find **Paid Applications** (or "Paid Apps"). Status will read _Pending_ or
   _New_.
3. **View and Agree to Terms** → read → accept.

Status moves to _waiting for banking and tax_. The free-apps agreement is
already active — that's what let TestFlight work.

## 2. Banking

1. Same section → **Banking** → **Add Bank Account**.
2. Pick the bank's country first — it decides which fields appear
   (IBAN, or account number + SWIFT/BIC, etc.).
3. The **account holder name must match your legal name on the developer
   account** — mismatches are the most common silent rejection here.
4. Currency: whatever the account actually holds. Apple converts payouts.

## 3. Tax forms

1. Same section → **Tax Forms**.
2. The **U.S. tax form is mandatory for everyone** — it covers selling on the
   U.S. storefront, not being American:
   - Non-U.S. individual → **W-8BEN** (the form asks about "U.S. activities" —
     for a solo dev with no U.S. presence the honest answer is no).
   - U.S. person/entity → W-9.
3. Other forms (Australia, Canada, Japan, Brazil…) appear only if required for
   those storefronts, and most can be skipped by not distributing there — but
   fill any marked _required_.

## 4. Wait for Active

The Paid Applications row goes _Processing_ → **Active**. Usually hours,
occasionally days. Until it says Active:

- Subscriptions cannot move to "Ready to Submit"
- Sandbox purchases can fail with vague errors that look like code bugs

If a sandbox purchase already works, this is likely already Active — check the
status anyway before submitting, because _Processing_ at review time bounces
the binary.

## 5. Then, immediately: the Small Business Program

Worth 15 points of margin — the cut drops from 30% to 15% under $1M/year,
which is worth more than every cost optimisation in the codebase combined.

1. [developer.apple.com/app-store/small-business-program/enroll](https://developer.apple.com/app-store/small-business-program/enroll) —
   again as **Account Holder**.
2. It requires the Paid Applications agreement to be Active first (step 4).
3. You confirm you're not associated with other developer accounts and that
   proceeds were under $1M.
4. **Timing matters:** enrollment takes effect the _following_ month. Enroll
   the moment step 4 completes, not the day before launch.

## The trap list

- Only the Account Holder sees these screens. An Admin role sees nothing and
  concludes the UI is broken.
- Bank name mismatch → silently stuck at "pending verification".
- Agreement _Active_ but products created _before_ it activated can sit in a
  stale state — if a subscription refuses to go "Ready to Submit", edit and
  re-save it.
- The agreement must be re-accepted when Apple updates terms (roughly yearly).
  A live app's purchases keep working, but new submissions block until
  re-accepted.
