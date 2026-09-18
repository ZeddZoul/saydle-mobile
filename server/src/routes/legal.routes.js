import { Router } from "express";

/**
 * The privacy policy and terms, served by the API itself.
 *
 * Both stores require a public URL for these before an app can even be
 * submitted, and the API is the one piece of Saydle that is always deployed —
 * so the documents live where the data lives, and there is no separate static
 * site to fall out of date.
 *
 * Unauthenticated on purpose: store reviewers, and people deciding whether to
 * sign up, are exactly the readers.
 */
export const legalRouter = Router();

const UPDATED = "2 September 2026";

/** One shared shell so the two documents cannot drift apart visually. */
const page = (title, body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — Saydle</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; margin: 0; color: #38223A; background: #FDF6F5; }
  main { max-width: 42rem; margin: 0 auto; padding: 2.5rem 1.25rem 5rem; line-height: 1.6; }
  h1 { font-size: 1.6rem; } h2 { font-size: 1.15rem; margin-top: 2rem; }
  .updated { color: #7A5A70; font-size: .9rem; }
  a { color: #FF6F61; }
</style>
</head>
<body><main>
<h1>${title}</h1>
<p class="updated">Last updated: ${UPDATED}</p>
${body}
</main></body>
</html>`;

const PRIVACY = page(
  "Privacy Policy",
  `
<p>Saydle is a daily affirmations app. This page explains what we collect, why,
and what happens to it. The short version: we collect what the product needs to
work, we sell nothing, and we show you no ads.</p>

<h2>What we collect</h2>
<p><strong>Your account.</strong> Your name, email address, and a hashed
password. We never store the password itself.</p>
<p><strong>What you tell Saydle about yourself.</strong> The onboarding and
profile answers — how you have been feeling, what you want to focus on, the tone
that suits you. Sharing these is optional; they exist so your affirmations can
be written for you rather than for everyone.</p>
<p><strong>What you do in the app.</strong> Affirmations you favourite or save,
lines you write yourself, your reading streak, and preferences such as theme,
language, reminder times and reading voice.</p>
<p><strong>Subscription status.</strong> Whether you have an active
subscription, reported by Apple or Google via RevenueCat. Payment details never
reach us — the app stores handle those entirely.</p>
<p>We do not collect your location, your contacts, or advertising identifiers,
and we use no analytics or tracking SDKs.</p>

<h2>Who processes it</h2>
<p>Saydle runs on a small number of services, each receiving only what its job
requires: <strong>MongoDB Atlas</strong> stores the data. <strong>Google Vertex
AI</strong> generates affirmations from your preferences and profile answers.
<strong>ElevenLabs</strong> turns affirmation text into audio — the text only,
never your name or account details. <strong>RevenueCat</strong> processes
subscription events from the app stores. <strong>Resend</strong> delivers
account emails such as verification codes and password resets.</p>
<p>Google Vertex AI receives your profile and onboarding answers, and your first
name if you have asked to be addressed by it. These providers process data on
servers in the United States under their standard contractual clauses, and none
of them is permitted to use your data for its own purposes.</p>

<h2>Reminders</h2>
<p>Daily reminders are scheduled locally on your device. We do not run a push
notification service and cannot send to your device from our servers.</p>

<h2>Deleting your account</h2>
<p>You can delete your account from the Profile screen. Deletion is scheduled
30 days out, and signing back in at any point before then cancels it. After the
grace period everything is permanently removed except a minimal record — a
hashed, unreadable form of your email and your billing history — kept for six
years because financial regulation requires it.</p>

<h2>Your rights</h2>
<p>You can access, correct, or delete your data at any time — most of it
directly in the app, and all of it by writing to us. If you are in the EU or
UK, these are your GDPR rights; we honour the same rights for everyone.</p>

<h2>Children</h2>
<p>Saydle is not directed at children under 13, and we do not knowingly collect
their data.</p>

<h2>Changes and contact</h2>
<p>If this policy changes materially, the app will say so. Questions and
requests: <a href="mailto:support@saydle.com">support@saydle.com</a>.</p>
`,
);

const TERMS = page(
  "Terms of Use",
  `
<p>These terms cover your use of Saydle, the daily affirmations app. Creating
an account means you agree to them.</p>

<h2>What Saydle is — and is not</h2>
<p>Saydle offers daily affirmations for reflection and encouragement. It is a
wellbeing product, <strong>not a medical or mental-health service</strong>: it
does not diagnose, treat, or prevent any condition, and it is not a substitute
for professional care. If you are struggling, please reach out to a qualified
professional or a local crisis line.</p>

<h2>Your account</h2>
<p>You must be at least 13 to use Saydle. Keep your password to yourself;
what happens under your account is your responsibility. You can delete your
account at any time from the Profile screen.</p>

<h2>Subscriptions</h2>
<p>Saydle Premium is a monthly or annual auto-renewing subscription, billed by
Apple or Google at the price shown before you confirm. It renews automatically
unless cancelled at least 24 hours before the end of the current period, and it
is cancelled through your App Store or Google Play account settings — deleting
the app, or your Saydle account, does not cancel a subscription. Refunds are
handled by the store you purchased through, under their policies.</p>

<h2>Your words</h2>
<p>Affirmations you write remain yours. You grant us only the licence needed to
store them, show them back to you, and — if you use the listening features —
have them read aloud to you. Do not use Saydle to store content that is
unlawful or that harasses or harms others; we may refuse or remove such
content and, for serious or repeated cases, close the account.</p>

<h2>Our content</h2>
<p>The affirmations Saydle writes, and the app itself — its design, artwork and
code — belong to Saydle. They are for your personal use, not for resale or
redistribution.</p>

<h2>The honest limits</h2>
<p>Saydle is provided as-is. We work to keep it available and correct, but we
cannot promise it will always be either, and to the extent the law allows, we
are not liable for indirect or consequential losses arising from its use.
Nothing in these terms limits rights that your local law does not allow to be
limited.</p>

<h2>Changes and contact</h2>
<p>If these terms change materially, the app will say so before the change
applies to you. Questions:
<a href="mailto:support@saydle.com">support@saydle.com</a>.</p>
`,
);

legalRouter.get("/privacy", (_req, res) => res.type("html").send(PRIVACY));
legalRouter.get("/terms", (_req, res) => res.type("html").send(TERMS));
