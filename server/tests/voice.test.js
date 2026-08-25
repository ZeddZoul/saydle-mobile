import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { registerUser } from "./helpers.js";
import { User } from "../src/models/User.js";
import { Affirmation } from "../src/models/Affirmation.js";
import { VoiceClip, clipKey } from "../src/models/VoiceClip.js";
import { VOICE_IDS, resolveVoice } from "../src/config/voices.js";

/**
 * The listening session's voice.
 *
 * Two things here are worth more than the endpoints: the cache, because it *is*
 * the cost model — voice is 10-20x what generation costs and the only line that
 * scales with engagement — and the deferral, because a voice change that took
 * effect today would discard seven already-rendered clips and bill us to make
 * them again.
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

const makeLines = async (user, texts) =>
  Affirmation.insertMany(
    texts.map((text, i) => ({
      user: user ? user._id : null,
      text,
      textKey: `${user ? user._id : "curated"}-${text}-${i}`.toLowerCase(),
      categorySlug: "calm",
      locale: "en",
      source: user ? "generated" : "curated",
    })),
  );

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(audio());
});

describe("POST /api/voice/session", () => {
  it("renders each line and hands back a clip per line, in order", async () => {
    const me = await registerUser(app);
    const user = await User.findById(me.user.id);
    const lines = await makeLines(user, ["I can begin again.", "Rest is not a reward."]);

    const res = await request(app)
      .post("/api/voice/session")
      .set("Authorization", me.auth)
      .send({ affirmationIds: lines.map((l) => String(l._id)), today: "2026-08-24" });

    expect(res.status).toBe(200);
    expect(res.body.rendered).toBe(true);
    expect(res.body.lines).toHaveLength(2);
    // Reading order is the order asked for — a session out of sequence is a
    // different session.
    expect(res.body.lines.map((l) => l.text)).toEqual([
      "I can begin again.",
      "Rest is not a reward.",
    ]);
    for (const line of res.body.lines) expect(line.clipId).toBeTruthy();
  });

  it("never renders the same line twice in the same voice", async () => {
    const me = await registerUser(app);
    const user = await User.findById(me.user.id);
    const lines = await makeLines(user, ["I can begin again."]);
    const body = { affirmationIds: [String(lines[0]._id)], today: "2026-08-24" };

    await request(app).post("/api/voice/session").set("Authorization", me.auth).send(body);
    await request(app).post("/api/voice/session").set("Authorization", me.auth).send(body);

    // The whole cost model in one assertion.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await VoiceClip.countDocuments()).toBe(1);
  });

  it("shares one clip between two readers given the same line", async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);
    // A curated line: no owner, so both readers can see it.
    const [line] = await makeLines(null, ["I am allowed to take up space."]);
    const body = { affirmationIds: [String(line._id)], today: "2026-08-24" };

    await request(app).post("/api/voice/session").set("Authorization", a.auth).send(body);
    await request(app).post("/api/voice/session").set("Authorization", b.auth).send(body);

    // Most of the saving on the free bank comes from exactly this.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("renders again when the voice differs, because a clip is per voice", async () => {
    const me = await registerUser(app);
    const user = await User.findById(me.user.id);
    const lines = await makeLines(user, ["I can begin again."]);
    const body = { affirmationIds: [String(lines[0]._id)], today: "2026-08-24" };

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
    const a = await registerUser(app);
    const b = await registerUser(app);
    const owner = await User.findById(b.user.id);
    const lines = await makeLines(owner, ["Something private."]);

    const res = await request(app)
      .post("/api/voice/session")
      .set("Authorization", a.auth)
      .send({ affirmationIds: [String(lines[0]._id)], today: "2026-08-24" });

    // Also the credit-spending guard: arbitrary ids must not become renders.
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caps a session at seven lines", async () => {
    const me = await registerUser(app);
    const user = await User.findById(me.user.id);
    const lines = await makeLines(
      user,
      Array.from({ length: 12 }, (_, i) => `Line number ${i}.`),
    );

    const res = await request(app)
      .post("/api/voice/session")
      .set("Authorization", me.auth)
      .send({ affirmationIds: lines.map((l) => String(l._id)), today: "2026-08-24" });

    expect(res.body.lines).toHaveLength(7);
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });

  it("rejects a request with nothing to read", async () => {
    const me = await registerUser(app);

    const res = await request(app)
      .post("/api/voice/session")
      .set("Authorization", me.auth)
      .send({ affirmationIds: [] });

    expect(res.status).toBe(400);
  });

  it("requires a session", async () => {
    const res = await request(app)
      .post("/api/voice/session")
      .send({ affirmationIds: ["x"] });
    expect(res.status).toBe(401);
  });

  it("hands back the line without a clip when the render fails", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, text: async () => "rate limited" });

    const me = await registerUser(app);
    const user = await User.findById(me.user.id);
    const lines = await makeLines(user, ["I can begin again."]);

    const res = await request(app)
      .post("/api/voice/session")
      .set("Authorization", me.auth)
      .send({ affirmationIds: [String(lines[0]._id)], today: "2026-08-24" });

    // A provider outage costs the quality of the voice, never the session.
    expect(res.status).toBe(200);
    expect(res.body.lines[0].clipId).toBeNull();
    expect(res.body.lines[0].text).toBe("I can begin again.");
  });
});

describe("GET /api/voice/clip/:id", () => {
  it("streams the audio, cached forever", async () => {
    const me = await registerUser(app);
    const user = await User.findById(me.user.id);
    const lines = await makeLines(user, ["I can begin again."]);

    const session = await request(app)
      .post("/api/voice/session")
      .set("Authorization", me.auth)
      .send({ affirmationIds: [String(lines[0]._id)], today: "2026-08-24" });

    const res = await request(app).get(`/api/voice/clip/${session.body.lines[0].clipId}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("audio/mpeg");
    // A clip's id is derived from its text and voice, so it can never go stale.
    expect(res.headers["cache-control"]).toContain("immutable");
  });

  it("404s for a clip that does not exist", async () => {
    const res = await request(app).get("/api/voice/clip/64b7f3d2c1a4e50012345678");
    expect(res.status).toBe(404);
  });
});

describe("the voice preference", () => {
  it("suggests a voice from their onboarding tone before they choose", async () => {
    const me = await registerUser(app);
    await User.updateOne({ _id: me.user.id }, { $set: { "preferences.tone": "gentle" } });

    const res = await request(app)
      .get("/api/voice/preference?today=2026-08-24")
      .set("Authorization", me.auth);

    expect(res.body.active).toBe("mother");
    expect(res.body.pending).toBeNull();
  });

  it("does not change today's voice when a new one is chosen", async () => {
    const me = await registerUser(app);

    const before = await request(app)
      .get("/api/voice/preference?today=2026-08-24")
      .set("Authorization", me.auth);

    const res = await request(app)
      .put("/api/voice/preference")
      .set("Authorization", me.auth)
      .send({ voice: "grandfather", today: "2026-08-24" });

    // Today's clips are already paid for. Switching now would bin them.
    expect(res.body.active).toBe(before.body.active);
    expect(res.body.pending).toBe("grandfather");
    expect(res.body.pendingFrom).toBe("2026-08-25");
  });

  it("takes effect the next day, and renders in the new voice then", async () => {
    const me = await registerUser(app);
    const user = await User.findById(me.user.id);
    const lines = await makeLines(user, ["I can begin again."]);

    await request(app)
      .put("/api/voice/preference")
      .set("Authorization", me.auth)
      .send({ voice: "grandfather", today: "2026-08-24" });

    const res = await request(app)
      .post("/api/voice/session")
      .set("Authorization", me.auth)
      .send({ affirmationIds: [String(lines[0]._id)], today: "2026-08-25" });

    expect(res.body.voice).toBe("grandfather");
    // Rendered against the new voice's id, not the old one.
    expect(fetchMock.mock.calls[0][0]).toContain(VOICE_IDS.grandfather);
  });

  it("crosses midnight on the reader's day, not the server's", async () => {
    const me = await registerUser(app);
    await request(app)
      .put("/api/voice/preference")
      .set("Authorization", me.auth)
      .send({ voice: "father", today: "2026-12-31" });

    const user = await User.findById(me.user.id);
    // Naive date arithmetic rolls this to 2026-12-32 or back a month.
    expect(user.preferences.voice.pendingFrom).toBe("2027-01-01");
  });

  it("refuses a voice we do not ship", async () => {
    const me = await registerUser(app);

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

describe("without an API key", () => {
  it("says so rather than pretending, so the app reads with device speech", async () => {
    vi.resetModules();
    vi.doMock("../src/config/env.js", async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, env: { ...actual.env, ELEVENLABS_API_KEY: undefined } };
    });

    const { createApp: freshApp } = await import("../src/app.js");
    const bare = freshApp();

    const me = await registerUser(bare);
    const user = await User.findById(me.user.id);
    const lines = await makeLines(user, ["I can begin again."]);

    const res = await request(bare)
      .post("/api/voice/session")
      .set("Authorization", me.auth)
      .send({ affirmationIds: [String(lines[0]._id)], today: "2026-08-24" });

    expect(res.body.rendered).toBe(false);
    expect(res.body.lines[0].clipId).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    vi.doUnmock("../src/config/env.js");
    vi.resetModules();
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
