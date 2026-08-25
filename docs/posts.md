# Shipaton posts

**X only.** Everything here is written to that shape:

- **Hook on line one**, and it has to survive alone — that is all most people
  see. The number goes in the hook, not the third line.
- **Single post by default.** A thread is for an idea that genuinely has steps;
  four of these do, and they are marked. Never pad one into a thread.
- **The image is half the post.** Every entry below names its screenshot.
- **~280 characters per unit.** Written to fit unpaid, so it works either way.
- **Hashtags at the end**: `#Shipaton` on everything, plus one or two of
  `#buildinpublic` `#reactnative` `#indiedev`. Not six. On X they cost reach
  past about two.

One a day. One idea each — never batched.

**The rule that makes these work:** lead with the number. "Fixed a slow load" is
nothing. "20.2 seconds against a 15-second timeout" is a post.

**Don't claim it's launched.** It isn't on a store yet. "Building" and "shipping
soon" are true and equally postable.

| #   | Post                                          | Status                     |
| --- | --------------------------------------------- | -------------------------- |
| 1   | The home-screen widget, both platforms        | **posted 2026-08-25**      |
| 2   | Why the Android widget is drawn, not laid out | next                       |
| 3   | 20.2s first load against a 15s timeout        |                            |
| 4   | Token economics of one 240-line call          |                            |
| 5   | Six themes, and softness bought per platform  |                            |
| 6   | The icons are rendered, not drawn             |                            |
| 7   | GDPR deletion done properly                   |                            |
| 8   | The RevenueCat `test_` key trap               |                            |
| 9   | Today became a feed — before/after            |                            |
| 10  | The video export engine, with a real mp4      |                            |
| 11  | The seven-selection eval                      |                            |
| 12  | The ElevenLabs voice test                     | blocked — needs the voices |
| 13  | The bug the fallback hid                      | thread, ready to write     |

---

## 1 — The home-screen widget · drafted

**Format:** single post + one image.

**Copy, as posted:**

> A home-screen widget has no network and no session. It can't fetch, and it
> can't ask.
>
> So Saydle hands it 14 days of affirmations at once — colours pre-resolved,
> keyed by date.
>
> The widget looks up its own today and draws it. Stays correct for two weeks
> even if you never open the app.
>
> #Shipaton #buildinpublic #reactnative

**Angle:** the constraint decided the design. A widget has no network, no
session, and no chance to ask a question.

**Numbers, all verified in `lib/widgetData.js`:**

- `WIDGET_DAYS = 14` — a fortnight handed over at once
- `MAX_TEXT = 90` — truncated on a word boundary, because widget type does not
  reflow the way the app's does
- Every colour resolved to a hex value up front; the widget process cannot read
  `theme/themes.js`
- Entries keyed by date — the widget formats its own date and looks it up
- Past days are dropped: a window on today, not an archive

**Screenshot:** iOS and Android side by side showing _the same affirmation_ —
that is what makes it read as one system rather than two widgets. Use a deeper
theme than the default dawn pink; the gradient reads better at widget size
against a real wallpaper.

**Held back for the replies**, not the post — the 90-character word-boundary
truncation and the dropped past days are good answers to "how does it handle X",
and they are wasted inside the hook.

**Teasing #2** ("the Android one has a much weirder story — tomorrow") works
better as a reply to your own post an hour later than as a fifth line.

---

## 2 — The Android widget is drawn, not laid out · next

**Format:** thread of 3. This one earns it — it is two dead ends and a fix, and
the dead ends are the value.

The most technically interesting one, and it costs nothing to write because the
hard part is already done. Both dead ends were **measured on a device**:

- `android:fontFamily="@font/fraunces_semibold"` in the layout — the font _is_
  in the APK (`unzip -l` confirms it), but the launcher inflates RemoteViews in
  its own process and drops the resource
- A `TypefaceSpan` carrying a real `Typeface` — `writeToParcel` serialises only
  the _family name_, so the typeface never survives the parcel

Both silently render Roboto. No error, no warning — it just isn't your font.

So `SaydleWidgetProvider` draws the whole card to a bitmap with Canvas —
gradient, glow, wordmark, quote, affirmation — because a Canvas is the only
surface where the `Typeface` is unambiguously ours. Plain TextViews stay as a
hidden fallback for when the bitmap can't be built.

**Screenshot:** the widget with real Fraunces, next to the Roboto version — on
post 1 of the thread, so it carries the hook.

**Hook to beat:** "You cannot put a custom font in an Android home-screen
widget. Two ways look right. Both silently give you Roboto."

---

## 3 — The 20.2-second first load

A new account's first request took **20.2s** against a **15s** client timeout
(`REQUEST_TIMEOUT_MS` in `lib/config.js`). So the work _completed_ — and the
reader was told "Could not reach Saydle."

The fix was moving generation off the read path entirely. `ensureFeed` now fills
missing days from the reader's own pool and then the curated bank — database
work only, **~90ms** — and hands anything the model must produce to
`scheduleReplenish`, which is deliberately never awaited.

**Why it's a good post:** the failure mode is the interesting part. It wasn't
slow-and-broken, it was slow-and-successful, which is worse, because the user
sees a network error for a request that worked.

---

## 4 — Token economics

**240 lines in one call is ~2.7× cheaper per line than six batches of forty**,
because you pay the prompt and the thinking budget once per call rather than six
times.

Measured on a real batch of Gemini 2.5 Flash:

- ~846 prompt tokens
- ~114 visible output tokens
- **~975 thinking tokens**

Thinking is roughly nine tenths of what you pay for, and it comes out of
`maxOutputTokens` — so a tight budget yields `finishReason: MAX_TOKENS` with an
_empty_ candidate. Post those three numbers; most people billing for Flash have
no idea about the third.

---

## 5 — Six themes

Screenshot all six gradients. The artwork is generated, and **softness is bought
differently per platform**: iOS blurs the whole field in one `BlurView`; Android
fades each shape out at its own edge (`softFill` in `ThemeArtwork`), because a
full-screen blur behind every screen is far more expensive there.

---

## 6 — The icons are rendered, not drawn

`scripts/icons.html` through headless Chrome, so the wordmark gets **real
Fraunces** rather than a lookalike. The old logo was set in some other face
entirely, which is why the splash never matched the landing screen.

The constraint worth posting: Android shows only the central **72dp** of the
**108dp** adaptive canvas and guarantees only a **66dp circle** — so a ~3:1
wordmark has to fit that circle _by its diagonal_. Anything above ~176px on a
1024px canvas loses the S and the e on a round launcher.

---

## 7 — GDPR deletion done properly

- **30-day grace period**, cancel by simply signing back in
- A **tombstone with a hashed email**, kept for the 6-year billing record
- The farewell email must send _before_ the purge, because the tombstone no
  longer holds an address to send to

Most indie apps just delete the row. Angle: deletion is a scheduling problem and
an ordering problem, not a `DELETE`.

---

## 8 — The RevenueCat `test_` key trap

Two consequences, and the second is worse:

1. The SDK refuses a Test Store key outside development — it shows an alert and
   **terminates the app**
2. In RevenueCat's own words, apps submitted with a Test Store key **will be
   rejected during App Review**

And `EXPO_PUBLIC_*` is inlined **at build time**, so the machine's `.env` is what
ships. Screenshot `usableKey()` in `lib/purchases.js` — it withholds the key when
`__DEV__` is false, which is a seatbelt against the crash and no help at all
against the rejection.

---

## 9 — Today became a feed

Before/after screenshot. Today used to be one line; it is now the full batch,
paged. Worth pairing with the detail that a paged list must take its page height
from **state, never a ref** — a ref updated in `onLayout` lands without a
re-render, so rendered pages keep the old height while `getItemLayout` reports
the new one, and the content walks further down the screen with every swipe.

---

## 10 — The video export engine

Show a real mp4 it produced. Stills + voice → shareable video, using
**AVFoundation** on iOS and **MediaCodec + MediaMuxer** on Android rather than
FFmpeg — which was retired in Jan 2025, had its binaries pulled that April, and
carries codec patent exposure.

Verified output: 143,701 bytes, h264, 540×960, 60 frames, 2.000s; muxed to
162,371 bytes with aac.

The detail worth including: H.264 requires **even dimensions**, so the height is
rounded down to an even number after the 9:16 maths.

---

## 11 — The seven-selection eval

The strongest _proof_ post: the same 40 lines, three very different readers,
**2.7/7 average overlap**. The picks move with the person.

The methodology is the post. Three cheap ways for "pick the seven most profound"
to look like it worked while doing nothing:

1. **positional** — return the first seven and call it taste
2. **length** — return the longest seven, a proxy for nothing
3. **impersonal** — return the _same_ seven for everyone

The third is the one a casual look misses: a selection can be thoughtful,
consistent, defensible — and identical for everybody.

One honest detail worth keeping in: the first run showed a mean pick index of
**14.0** against an unbiased 19.5, which looked like the model favouring what it
read first. Shuffling the pool moved it to **25.6** — so the lean was the
hand-written list all along, not the model. `server/scripts/evalPracticePicks.mjs`.

---

## 12 — The ElevenLabs voice test · blocked

Save it for when the voices exist. Five archetypes — fatherly, mentor,
alongside, motherly, grandmotherly — are wired and audible today on device TTS
placeholders (`lib/voices.js`), which is enough to feel the pacing but is
deliberately not the product: a satnav voice reading "I am enough" works against
the thing Saydle sells.

The rule that ships with it and is worth a line: **changing your voice takes
effect tomorrow, never today.** Today's audio is already rendered and cached per
`(text, voiceId)`, so an immediate switch would throw that away and pay to render
the same seven lines again.

---

## 13 — The bug the fallback hid · ready to write

**Format:** thread of 4. It earns it: a symptom, two wrong answers, the line in
the log that settled it, and the cause.

**The hook, and the whole post in two sentences:** my audio played perfectly in
curl and made no sound on the device. Nothing logged an error, because the
fallback was working.

**The chain, in order:**

1. Practice reads seven affirmations aloud in a real voice, with device
   text-to-speech as the fallback when a clip is missing.
2. On device, every line came out in the robot voice. `curl` fetched the same
   mp3 fine and it played fine on a laptop.
3. Two plausible fixes, both real bugs, neither the cause: `play()` on an
   `expo-audio` player that has not finished loading is a **no-op**, and the
   status events that would announce readiness only fire _while playing_ —
   circular. And iOS needs `setAudioModeAsync({ playsInSilentMode: true })` or
   the hardware mute switch silences playback.
4. The device log had it all along:

   ```
   15:50:14  FigStreamPlayer ... StreamBufferFull   ← downloaded, buffered
   15:50:18  AudioQueueObject ... play              ← exactly 4s later
   ```

   Four seconds was my fallback timeout. Loaded, never played, gave up.

5. **The cause: AVPlayer probes a progressive HTTP source with
   `Range: bytes=0-1` before it will commit.** The server answered `200` with
   the whole body instead of `206 Partial Content`. The item never reached
   `readyToPlay`.

**The numbers, same session before and after:**

|                          | before | after |
| ------------------------ | ------ | ----- |
| `play()` fired           | 0      | 7     |
| `playing: true` updates  | 0      | 54    |
| fell back to robot voice | 7      | 0     |

**The point worth making, and the reason this is a post rather than a
changelog:** a graceful fallback turned a hard failure into a soft one. Nothing
crashed, nothing logged, and the app looked like it worked — it just sounded
wrong. Degradation is the right design and it cost me three attempts, because
the thing that keeps users unblocked is the same thing that keeps you from
noticing.

**Bonus trap, same handler:** Express's `res.set` runs `mime.charsets.lookup`
and appends `; charset=utf-8` to anything it does not recognise — so binary
audio went out mislabelled. `res.setHeader` avoids it.
