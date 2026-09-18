# App Store listing — paste-ready

Every field below maps to a box in App Store Connect. Character limits are
Apple's, and each entry here is already inside them.

## Identity

| Field          | Value                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| Name (30)      | `Saydle — Daily Affirmations`                                                                          |
| Subtitle (30)  | `Affirmations written for you`                                                                         |
| Category       | Lifestyle (secondary: Health & Fitness)                                                                |
| Age rating     | 4+ (see the questionnaire notes below)                                                                 |
| Support URL    | `https://saydle.com` — the FAQ links `support@saydle.com`; a dedicated `/support` page would be better |
| Marketing URL  | optional — leave empty for v1                                                                          |
| Privacy Policy | `https://saydle.com/privacy`                                                                           |
| Support email  | `support@saydle.com` — **must receive mail before submission**                                         |

## Promotional text (170 chars, changeable without review)

> A new affirmation every morning, written for where you are — and a calm
> voice to read today's seven back to you.

## Description (4000 max — this is ~1,800)

> Some mornings need a steadier voice.
>
> Saydle gives you one new affirmation every day — and if you tell it a little
> about yourself, it writes them for you: your name stays out of them, but your
> life doesn't. What you're working on, how you've been, the tone that suits
> you. Not the same lines everyone gets.
>
> READ ONE, KEEP THE ONES THAT LAND
> Swipe through today's lines. Heart the ones that land. Bookmark the ones you
> mean to come back to — they wait on your shelf.
>
> LISTEN INSTEAD
> Practice reads today's seven most personal lines aloud, one at a time, with
> room to breathe between them. Choose the voice that helps: fatherly, mentor,
> alongside you, motherly, or grandfatherly. Changing voices takes effect
> tomorrow — today's session stays whole.
>
> MAKE IT YOURS
> Six hand-drawn themes. A home-screen widget that keeps two weeks of
> affirmations ready, even offline. Gentle local reminders at times you choose.
> Write your own lines in My Words and meet them again in your feed.
>
> QUIET BY DESIGN
> No ads. No tracking. No feed of other people. Saydle works offline, asks for
> one small thing at a time, and deletes your account properly when you ask —
> with a 30-day window to change your mind.
>
> Saydle is a wellbeing companion, not a medical or mental-health service.
>
> —
>
> Saydle Premium unlocks affirmations written personally for you, the listening
> session, your shelf, and My Words. Monthly or annual, auto-renewing;
> payment is charged to your Apple ID account at confirmation of purchase, and
> the subscription renews automatically unless cancelled at least 24 hours
> before the end of the current period. Manage or cancel in your App Store
> account settings.
>
> Terms: https://saydle.com/terms
> Privacy: https://saydle.com/privacy

## Keywords (100 chars, comma-separated, no spaces after commas)

```
affirmation,daily,self love,positivity,mindful,calm,confidence,gratitude,widget,motivation
```

(96 characters. Don't repeat "Saydle" or "affirmations" — the name and its
plural are already indexed from the title.)

## What's New (first release)

> Saydle's first release: a daily affirmation written for you, a listening
> session in a voice you choose, themes, widgets, and a shelf for the lines
> you mean to keep.

## Spanish (es-ES / es-MX locale)

| Field         | Value                           |
| ------------- | ------------------------------- |
| Name          | `Saydle — Afirmaciones diarias` |
| Subtitle (30) | `Afirmaciones escritas para ti` |

Promotional:

> Una afirmación nueva cada mañana, escrita para tu momento — y una voz serena
> que te lee las siete de hoy.

(Full Spanish description: translate the English above after it settles —
`pnpm translate es` does not cover store copy, and this one deserves a human
pass anyway.)

## Age-rating questionnaire

Answer **None / No** to every category — no violence, no sexual content, no
gambling, no user-to-user interaction, no unrestricted web access, no medical
information. Result is 4+. ("Wellbeing" content is not the Medical category —
the terms page states Saydle is not a medical service, deliberately.)
