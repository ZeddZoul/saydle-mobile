import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { registerUser, entitle } from "./helpers.js";
import { User } from "../src/models/User.js";
import { Affirmation } from "../src/models/Affirmation.js";
import { VoiceClip, clipKey } from "../src/models/VoiceClip.js";
import { VOICE_IDS, resolveVoice } from "../src/config/voices.js";
import { signClip, verifyClipSignature } from "../src/services/clipSignature.js";
import { todayInZone, addDays } from "../src/utils/dates.js";

/**
 * The listening session's voice.
 *
 * Two things here are worth more than the endpoints: the cache, because it *is*
 * the cost model — voice is 10-20x what generation costs and the only line that
 * scales with engagement — and the deferral, because a voice change that took
 * effect today would discard seven already-rendered clips and bill us to make
 * them again.
 *
 * Both are premium. A free account gets the device's voice and nothing here.
 */

// The provider is mocked, never called. What is under test is what surrounds it.
const fetchMock = vi.fn();
vi.stubGlobal("fetch", (...args) => fetchMock(...args));

vi.mock("../src/config/env.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, env: { ...actual.env, ELEVENLABS_API_KEY: "test-key" } };
});

const app = createApp();

const audio = () => ({
  ok: true,
  arrayBuffer: async () => new TextEncoder().encode("ID3-fake-mp3").buffer,
});

const makeLines = async (user, texts, source) =>
  Affirmation.insertMany(
    texts.map((text, i) => ({
      user: user ? user._id : null,
      text,
      textKey: `${user ? user._id : "curated"}-${text}-${i}`.toLowerCase(),
      categorySlug: "calm",
      locale: "en",
      source: source ?? (user ? "generated" : "curated"),
    })),
  );

/** A subscriber: the only kind of account the voice is for. */
async function premium(app_ = app, overrides = {}) {
  const me = await registerUser(app_, overrides);
  const user = await entitle(await User.findById(me.user.id));
  return { me, user };
}

const today = (user) => todayInZone(user.timezone);

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(audio());
});

describe("the paywall", () => {
  it("turns a free reader away from a session with the same 403 the library uses", async () => {
    const me = await registerUser(app);
    const user = await User.findById(me.user.id);
    const lines = await makeLines(user, ["I can begin again."]);

    const res = await request(app)
      .post("/api/voice/session")
      .set("Authorization", me.auth)
      .send({ affirmationIds: [String(lines[0]._id)] });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
    // Nothing rendered for someone who has not paid for rendering.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not let a free reader choose a voice", async () => {
    const me = await registerUser(app);

    const res = await request(app)
      .put("/api/voice/preference")
      .set("Authorization", me.auth)
      .send({ voice: "grandfather" });

    expect(res.status).toBe(403);
  });

  it("still tells a free reader which voice would read", async () => {
    // Reading the preference is harmless and the settings screen needs it.
    const me = await registerUser(app);
    const res = await request(app).get("/api/voice/preference").set("Authorization", me.auth);
    expect(res.status).toBe(200);
    expect(res.body.active).toBeTruthy();
  });
});

describe("POST /api/voice/session", () => {
  it("renders each line and hands back a clip per line, in order", async () => {
    const { me, user } = await premium();
    const lines = await makeLines(user, ["I can begin again.", "Rest is not a reward."]);

    const res = await request(app)
      .post("/api/voice/session")
      .set("Authorization", me.auth)
      .send({ affirmationIds: lines.map((l) => String(l._id)), today: "2026-08-24" });

    expect(res.status).toBe(200);
    expect(res.body.rendered).toBe(true);
    expect(res.body.throttled).toBe(false);
    expect(res.body.lines).toHaveLength(2);
    // Reading order is the order asked for — a session out of sequence is a
    // different session.
    expect(res.body.lines.map((l) => l.text)).toEqual([
      "I can begin again.",
      "Rest is not a reward.",
    ]);
    for (const line of res.body.lines) {
      expect(line.clipId).toBeTruthy();
      // A shared clip's URL is plain: nothing about it is private.
      expect(line.clipUrl).toBe(`/api/voice/clip/${line.clipId}`);
    }
  });

  it("never renders the same line twice in the same voice", async () => {
    const { me, user } = await premium();
    const lines = await makeLines(user, ["I can begin again."]);
    const body = { affirmationIds: [String(lines[0]._id)] };

    await request(app).post("/api/voice/session").set("Authorization", me.auth).send(body);
    await request(app).post("/api/voice/session").set("Authorization", me.auth).send(body);

    // The whole cost model in one assertion.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await VoiceClip.countDocuments()).toBe(1);
  });

  it("shares one clip between two readers given the same line", async () => {
    const a = await premium();
    const b = await premium();
    // A curated line: no owner, so both readers can see it.
    const [line] = await makeLines(null, ["I am allowed to take up space."]);
    const body = { affirmationIds: [String(line._id)] };

    await request(app).post("/api/voice/session").set("Authorization", a.me.auth).send(body);
    await request(app).post("/api/voice/session").set("Authorization", b.me.auth).send(body);

    // Most of the saving on the free bank comes from exactly this.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("renders again when the voice differs, because a clip is per voice", async () => {
    const { me, user } = await premium();
    const lines = await makeLines(user, ["I can begin again."]);
    const body = { affirmationIds: [String(lines[0]._id)] };

    await request(app).post("/api/voice/session").set("Authorization", me.auth).send(body);

    // Not "father" — the default tone is `grounded`, which already resolves to
    // it, so setting that would be setting the voice to itself.
    user.preferences.voice = { active: "grandfather", pending: "", pendingFrom: "" };
    await user.save();
    await request(app).post("/api/voice/session").set("Authorization", me.auth).send(body);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await VoiceClip.countDocuments()).toBe(2);
  });

  it("will not read a line belonging to someone else", async () => {
    const a = await premium();
    const b = await premium();
    const lines = await makeLines(b.user, ["Something private."]);

    const res = await request(app)
      .post("/api/voice/session")
      .set("Authorization", a.me.auth)
      .send({ affirmationIds: [String(lines[0]._id)] });

    // Also the credit-spending guard: arbitrary ids must not become renders.
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caps a session at seven lines", async () => {
    const { me, user } = await premium();
    const lines = await makeLines(
      user,
      Array.from({ length: 12 }, (_, i) => `Line number ${i}.`),
    );

    const res = await request(app)
      .post("/api/voice/session")
      .set("Authorization", me.auth)
      .send({ affirmationIds: lines.map((l) => String(l._id)) });

    expect(res.body.lines).toHaveLength(7);
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });

  it("rejects a request with nothing to read", async () => {
    const { me } = await premium();

    const res = await request(app)
      .post("/api/voice/session")
      .set("Authorization", me.auth)
      .send({ affirmationIds: [] });

    expect(res.status).toBe(400);
  });

  it("rejects a body that is not the shape it expects", async () => {
    const { me } = await premium();

    for (const body of [
      { affirmationIds: "not-an-array" },
      { affirmationIds: ["not-an-id"] },
      { affirmationIds: ["64b7f3d2c1a4e50012345678"], extra: true },
      { affirmationIds: ["64b7f3d2c1a4e50012345678"], today: "yesterday" },
    ]) {
      const res = await request(app)
        .post("/api/voice/session")
        .set("Authorization", me.auth)
        .send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires a session", async () => {
    const res = await request(app)
      .post("/api/voice/session")
      .send({ affirmationIds: ["x"] });
    expect(res.status).toBe(401);
  });

  it("hands back the line without a clip when the render fails", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, text: async () => "rate limited" });

    const { me, user } = await premium();
    const lines = await makeLines(user, ["I can begin again."]);

    const res = await request(app)
      .post("/api/voice/session")
      .set("Authorization", me.auth)
      .send({ affirmationIds: [String(lines[0]._id)] });

    // A provider outage costs the quality of the voice, never the session.
    expect(res.status).toBe(200);
    expect(res.body.lines[0].clipId).toBeNull();
    expect(res.body.lines[0].clipUrl).toBeNull();
    expect(res.body.lines[0].text).toBe("I can begin again.");
  });
});

describe("GET /api/voice/clip/:id", () => {
  const clipFor = async () => {
    const { me, user } = await premium();
    const lines = await makeLines(user, ["I can begin again."]);

    const session = await request(app)
      .post("/api/voice/session")
      .set("Authorization", me.auth)
      .send({ affirmationIds: [String(lines[0]._id)] });

    return session.body.lines[0].clipId;
  };

  it("streams the audio, cached forever", async () => {
    const res = await request(app).get(`/api/voice/clip/${await clipFor()}`);

    expect(res.status).toBe(200);
    // No charset. Express's res.set runs mime.charsets.lookup and appends
    // "; charset=utf-8" to anything it does not recognise, which is meaningless
    // on binary audio and rejected by some players.
    expect(res.headers["content-type"]).toBe("audio/mpeg");
    // A clip's id is derived from its text and voice, so it can never go stale.
    expect(res.headers["cache-control"]).toContain("immutable");
  });

  it("answers a range request with 206, which is what makes it play at all", async () => {
    const res = await request(app)
      .get(`/api/voice/clip/${await clipFor()}`)
      .set("Range", "bytes=0-1");

    // AVPlayer probes a progressive HTTP source with exactly this before it
    // will commit. Answer 200 with the whole body and the item never reaches
    // readyToPlay: the clip downloads, buffers, and silently never sounds.
    expect(res.status).toBe(206);
    expect(res.headers["content-range"]).toMatch(/^bytes 0-1\/\d+$/);
    expect(res.headers["content-length"]).toBe("2");
  });

  it("advertises range support even on a full response", async () => {
    const res = await request(app).get(`/api/voice/clip/${await clipFor()}`);
    expect(res.headers["accept-ranges"]).toBe("bytes");
  });

  it("serves an open-ended range to the end", async () => {
    const id = await clipFor();
    const full = await request(app).get(`/api/voice/clip/${id}`);
    const total = Number(full.headers["content-length"]);

    const res = await request(app).get(`/api/voice/clip/${id}`).set("Range", "bytes=1-");

    expect(res.status).toBe(206);
    expect(res.headers["content-range"]).toBe(`bytes 1-${total - 1}/${total}`);
  });

  it("serves a suffix range, which is how a player reads trailing metadata", async () => {
    const id = await clipFor();
    const total = Number(
      (await request(app).get(`/api/voice/clip/${id}`)).headers["content-length"],
    );

    const res = await request(app).get(`/api/voice/clip/${id}`).set("Range", "bytes=-4");

    expect(res.status).toBe(206);
    expect(res.headers["content-range"]).toBe(`bytes ${total - 4}-${total - 1}/${total}`);
  });

  it("416s a range past the end rather than serving nothing", async () => {
    const res = await request(app)
      .get(`/api/voice/clip/${await clipFor()}`)
      .set("Range", "bytes=999999999-");

    expect(res.status).toBe(416);
    expect(res.headers["content-range"]).toMatch(/^bytes \*\/\d+$/);
  });

  it("404s for a clip that does not exist", async () => {
    const res = await request(app).get("/api/voice/clip/64b7f3d2c1a4e50012345678");
    expect(res.status).toBe(404);
  });
});

/**
 * Someone's own words are theirs alone.
 *
 * A "My words" line is private by definition, so its clip is keyed on the
 * owner and served only under a signed, short-lived URL — the audio player
 * cannot send a bearer header, so the URL has to carry its own proof.
 */
describe("a clip of my own words", () => {
  const ownWords = async (text = "I am the one who gets to decide this.") => {
    const { me, user } = await premium();
    const [line] = await makeLines(user, [text], "custom");

    const session = await request(app)
      .post("/api/voice/session")
      .set("Authorization", me.auth)
      .send({ affirmationIds: [String(line._id)] });

    return { me, user, line: session.body.lines[0] };
  };

  it("comes back under a signed URL", async () => {
    const { line } = await ownWords();

    expect(line.clipId).toBeTruthy();
    expect(line.clipUrl).toMatch(
      new RegExp(`^/api/voice/clip/${line.clipId}\\?sig=[\\w-]+&exp=\\d+$`),
    );

    const stored = await VoiceClip.findById(line.clipId).lean();
    expect(String(stored.user)).toBeTruthy();
  });

  it("plays for the owner, privately cached", async () => {
    const { line } = await ownWords();

    const res = await request(app).get(line.clipUrl);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("audio/mpeg");
    expect(res.headers["cache-control"]).toMatch(/^private/);
    expect(res.headers["cache-control"]).not.toContain("immutable");
  });

  it("refuses the bare id, which is all a guess or a shared link would have", async () => {
    const { line } = await ownWords();

    const res = await request(app).get(`/api/voice/clip/${line.clipId}`);

    expect(res.status).toBe(403);
  });

  it("refuses a signature that does not match", async () => {
    const { line } = await ownWords();
    const forged = line.clipUrl.replace(
      /sig=[\w-]+/,
      "sig=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    );

    expect((await request(app).get(forged)).status).toBe(403);
    // And a signature for another clip, or with the expiry tampered.
    const other = line.clipUrl.replace(
      /exp=\d+/,
      `exp=${Math.floor(Date.now() / 1000) + 99999}`,
    );
    expect((await request(app).get(other)).status).toBe(403);
  });

  it("refuses a signature that has expired", async () => {
    const { line } = await ownWords();
    // Signed two hours ago, good for one.
    const { sig, exp } = signClip(line.clipId, { now: Date.now() - 2 * 60 * 60 * 1000 });

    const res = await request(app).get(`/api/voice/clip/${line.clipId}?sig=${sig}&exp=${exp}`);

    expect(res.status).toBe(403);
    expect(verifyClipSignature(line.clipId, sig, exp)).toBe(false);
  });

  it("is not shared with someone who wrote the very same sentence", async () => {
    const text = "I am the one who gets to decide this.";
    await ownWords(text);
    await ownWords(text);

    // Two people, two clips, two renders. Sharing here would let one of them
    // play a file that exists because of the other's private words.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await VoiceClip.countDocuments()).toBe(2);
  });

  it("is keyed apart from the shared clip of the same words", () => {
    expect(clipKey("Same words.", "v1", "owner-a")).not.toBe(clipKey("Same words.", "v1"));
    expect(clipKey("Same words.", "v1", "owner-a")).not.toBe(
      clipKey("Same words.", "v1", "owner-b"),
    );
    // And a shared key is what it always was — nothing already rendered is orphaned.
    expect(clipKey("Same words.", "v1")).toBe(clipKey("Same words.", "v1", null));
  });
});

describe("GET /api/voice/preview/:key", () => {
  it("renders the sample in that voice", async () => {
    const res = await request(app).get("/api/voice/preview/grandfather");

    expect(res.status).toBe(200);
    expect(res.body.voice).toBe("grandfather");
    expect(res.body.clipId).toBeTruthy();
    expect(fetchMock.mock.calls[0][0]).toContain(VOICE_IDS.grandfather);
  });

  it("renders each sample once, ever, for everybody", async () => {
    await request(app).get("/api/voice/preview/mother");
    await request(app).get("/api/voice/preview/mother");

    // The sample is the same sentence for every reader, so five clips cover
    // auditioning across the entire user base, permanently.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("needs no session — a preview belongs to a voice, not a person", async () => {
    // The audio player fetches this directly and carries no token.
    const res = await request(app).get("/api/voice/preview/peer");
    expect(res.status).toBe(200);
  });

  it("404s for a voice we do not ship", async () => {
    const res = await request(app).get("/api/voice/preview/morgan-freeman");

    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the voice preference", () => {
  it("suggests a voice from their onboarding tone before they choose", async () => {
    const { me } = await premium();
    await User.updateOne({ _id: me.user.id }, { $set: { "preferences.tone": "gentle" } });

    const res = await request(app)
      .get("/api/voice/preference?today=2026-08-24")
      .set("Authorization", me.auth);

    expect(res.body.active).toBe("mother");
    expect(res.body.pending).toBeNull();
  });

  it("does not change today's voice when a new one is chosen", async () => {
    const { me, user } = await premium();

    const before = await request(app)
      .get("/api/voice/preference")
      .set("Authorization", me.auth);

    const res = await request(app)
      .put("/api/voice/preference")
      .set("Authorization", me.auth)
      .send({ voice: "grandfather" });

    // Today's clips are already rendered and paid for. Switching now would bin
    // them and bill us to make the same seven sentences again.
    expect(res.body.active).toBe(before.body.active);
    expect(res.body.pending).toBe("grandfather");
    expect(res.body.pendingFrom).toBe(addDays(today(user), 1));
  });

  it("ignores the day the app claims it is", async () => {
    const { me, user } = await premium();

    // A client that could name the day could name yesterday, and have a
    // "from tomorrow" change land on today's seven already-paid renders.
    const res = await request(app)
      .put("/api/voice/preference")
      .set("Authorization", me.auth)
      .send({ voice: "grandfather", today: "1999-01-01" });

    expect(res.status).toBe(200);
    expect(res.body.pendingFrom).toBe(addDays(today(user), 1));
  });

  it("takes effect the next day, and renders in the new voice then", async () => {
    const { me, user } = await premium();
    const lines = await makeLines(user, ["I can begin again."]);

    // Chosen yesterday, so its day has come.
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          "preferences.voice": {
            active: "mother",
            pending: "grandfather",
            pendingFrom: today(user),
          },
        },
      },
    );

    const res = await request(app)
      .post("/api/voice/session")
      .set("Authorization", me.auth)
      .send({ affirmationIds: [String(lines[0]._id)] });

    expect(res.body.voice).toBe("grandfather");
    expect(fetchMock.mock.calls[0][0]).toContain(VOICE_IDS.grandfather);
  });

  describe("on the reader's calendar, not the server's", () => {
    // Only Date is faked: the driver's own timers must keep running.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-12-31T12:00:00Z"));
    });
    afterEach(() => vi.useRealTimers());

    it("crosses midnight on the reader's day", async () => {
      // Noon UTC on New Year's Eve is already New Year's Day in Auckland and
      // still the morning of the 31st in Honolulu.
      const nz = await premium(app, { timezone: "Pacific/Auckland" });
      const hi = await premium(app, { timezone: "Pacific/Honolulu" });

      const pick = (me) =>
        request(app)
          .put("/api/voice/preference")
          .set("Authorization", me.auth)
          // Not "father": the default tone already resolves to it, and choosing
          // the voice that is already reading reports no pending change.
          .send({ voice: "grandfather" });

      // Naive date arithmetic gives 2026-12-32, or rolls back a month.
      expect((await pick(nz.me)).body.pendingFrom).toBe("2027-01-02");
      expect((await pick(hi.me)).body.pendingFrom).toBe("2027-01-01");
    });
  });

  it("refuses a voice we do not ship", async () => {
    const { me } = await premium();

    const res = await request(app)
      .put("/api/voice/preference")
      .set("Authorization", me.auth)
      .send({ voice: "morgan-freeman" });

    expect(res.status).toBe(400);
  });

  it("degrades a retired voice key rather than rendering silence", async () => {
    // Exactly what happened when `grandmother` became `grandfather`.
    const user = { preferences: { voice: { active: "grandmother" }, tone: "energetic" } };
    expect(resolveVoice(user, "2026-08-24")).toBe("peer");
  });
});

/**
 * The daily render budget.
 *
 * Cache hits are free; only what ElevenLabs is actually asked to render
 * counts. Past the line, the session still comes back — with the device left
 * to read the rest of it — because a session that stops is worse than one in
 * the wrong voice.
 */
describe("the render budget", () => {
  let bare;

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock("../src/config/env.js", async (importOriginal) => {
      const actual = await importOriginal();
      return {
        ...actual,
        env: { ...actual.env, ELEVENLABS_API_KEY: "test-key", VOICE_DAILY_CHAR_BUDGET: 60 },
      };
    });
    const { createApp: freshApp } = await import("../src/app.js");
    bare = freshApp();
  });

  afterEach(() => {
    vi.doUnmock("../src/config/env.js");
    vi.resetModules();
  });

  // Each spoken line is ~25 characters, so a 60-character budget covers two.
  const texts = [
    "I can begin again today.",
    "I am allowed to rest now.",
    "I can let this be enough.",
  ];

  it("stops rendering for the day once the budget is spent", async () => {
    const { me, user } = await premium(bare);
    const lines = await makeLines(user, texts);

    const res = await request(bare)
      .post("/api/voice/session")
      .set("Authorization", me.auth)
      .send({ affirmationIds: lines.map((l) => String(l._id)) });

    expect(res.status).toBe(200);
    expect(res.body.throttled).toBe(true);
    expect(res.body.lines.map((l) => Boolean(l.clipId))).toEqual([true, true, false]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps serving what is already rendered", async () => {
    const { me, user } = await premium(bare);
    const lines = await makeLines(user, texts);
    const body = { affirmationIds: lines.map((l) => String(l._id)) };

    await request(bare).post("/api/voice/session").set("Authorization", me.auth).send(body);
    const again = await request(bare)
      .post("/api/voice/session")
      .set("Authorization", me.auth)
      .send(body);

    // Over budget, and the two paid-for clips still play. A cache hit is free.
    expect(again.body.lines.map((l) => Boolean(l.clipId))).toEqual([true, true, false]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("is per reader — one account's afternoon does not silence another's", async () => {
    const a = await premium(bare);
    const b = await premium(bare);
    const mine = await makeLines(a.user, texts);
    const theirs = await makeLines(b.user, ["I can start over.", "I am still here."]);

    await request(bare)
      .post("/api/voice/session")
      .set("Authorization", a.me.auth)
      .send({ affirmationIds: mine.map((l) => String(l._id)) });

    const res = await request(bare)
      .post("/api/voice/session")
      .set("Authorization", b.me.auth)
      .send({ affirmationIds: theirs.map((l) => String(l._id)) });

    expect(res.body.throttled).toBe(false);
    expect(res.body.lines.every((l) => l.clipId)).toBe(true);
  });
});

describe("without an API key", () => {
  it("says so rather than pretending, so the app reads with device speech", async () => {
    vi.resetModules();
    vi.doMock("../src/config/env.js", async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, env: { ...actual.env, ELEVENLABS_API_KEY: undefined } };
    });

    const { createApp: freshApp } = await import("../src/app.js");
    const bare = freshApp();

    const { me, user } = await premium(bare);
    const lines = await makeLines(user, ["I can begin again."]);

    const res = await request(bare)
      .post("/api/voice/session")
      .set("Authorization", me.auth)
      .send({ affirmationIds: [String(lines[0]._id)] });

    expect(res.body.rendered).toBe(false);
    expect(res.body.lines[0].clipId).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    vi.doUnmock("../src/config/env.js");
    vi.resetModules();
  });
});

describe("clipKey", () => {
  it("is the same for the same text and voice", () => {
    expect(clipKey("I can begin again.", "v1")).toBe(clipKey("I can begin again.", "v1"));
  });

  it("differs by voice", () => {
    expect(clipKey("I can begin again.", "v1")).not.toBe(clipKey("I can begin again.", "v2"));
  });

  it("differs by text", () => {
    expect(clipKey("One.", "v1")).not.toBe(clipKey("Two.", "v1"));
  });
});
