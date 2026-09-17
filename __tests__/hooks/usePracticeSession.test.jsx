import { renderHook, waitFor } from "@testing-library/react-native";
import { AuthProvider } from "../../contexts/AuthContext.jsx";
import { usePracticeSession, SESSION_SIZE } from "../../hooks/usePracticeSession.js";
import { ApiError, NetworkError } from "../../lib/errors.js";

const USER = { id: "u1", firstName: "Ada", email: "ada@example.com" };

const lines = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `a${i}`,
    text: `Line ${i}`,
    source: "generated",
  }));

const makeStore = () => ({
  hasSession: jest.fn(async () => true),
  getAccessToken: jest.fn(async () => "a1"),
  getRefreshToken: jest.fn(async () => "r1"),
  setSession: jest.fn(async () => {}),
  clear: jest.fn(async () => {}),
});

const makeCache = () => ({
  loadUser: jest.fn(async () => USER),
  saveUser: jest.fn(async () => {}),
  loadFeed: jest.fn(async () => null),
  saveFeed: jest.fn(async () => {}),
  loadFavorites: jest.fn(async () => null),
  saveFavorites: jest.fn(async () => {}),
  loadOutbox: jest.fn(async () => []),
  saveOutbox: jest.fn(async () => {}),
  clear: jest.fn(async () => {}),
});

const makeClient = (over = {}) => ({
  me: jest.fn(async () => ({ user: USER })),
  library: jest.fn(async () => ({
    affirmations: [...lines(9), { id: "c1", text: "Mine.", source: "custom" }],
    cursor: 0,
    total: 10,
    remaining: 10,
    refilling: false,
  })),
  librarySeen: jest.fn(async () => ({ cursor: 0 })),
  voiceSession: jest.fn(async (ids) => ({
    lines: ids.map((id) => ({ id, clipId: `clip-${id}` })),
  })),
  ...over,
});

const setup = async (client = makeClient()) => {
  const Wrapper = ({ children }) => (
    <AuthProvider store={makeStore()} cache={makeCache()} client={client}>
      {children}
    </AuthProvider>
  );
  Wrapper.displayName = "AuthWrapper";

  return { client, ...(await renderHook(() => usePracticeSession(), { wrapper: Wrapper })) };
};

/**
 * Seven lines, and whichever voice the server will let this reader have.
 *
 * The real voice is premium. What these pin is that the session never fails
 * on that account: a 403 is the paywall answering, and the phone reads the
 * seven instead — the same thing it does offline, with one quiet flag so the
 * screen can say what a subscription adds.
 */
describe("usePracticeSession", () => {
  it("takes the first seven, never the reader's own words", async () => {
    const { result } = await setup();

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.lines).toHaveLength(SESSION_SIZE);
    expect(result.current.lines.some((l) => l.source === "custom")).toBe(false);
  });

  it("upgrades to the rendered clips when the server sends them", async () => {
    const { result, client } = await setup();

    await waitFor(() => expect(result.current.lines[0]?.clipUrl).toMatch(/clip-a0/));
    expect(client.voiceSession).toHaveBeenCalledWith(
      result.current.lines.map((l) => l.id),
      expect.any(String),
    );
    expect(result.current.voiceLocked).toBe(false);
  });

  it("plays a signed clip from the path the server named, never from the bare id", async () => {
    const { result } = await setup(
      makeClient({
        voiceSession: jest.fn(async (ids) => ({
          lines: ids.map((id, i) => ({
            id,
            clipId: `clip-${id}`,
            // The first line is the reader's own words: private, so signed. A
            // URL built from the id would drop the signature and 403.
            clipUrl:
              i === 0
                ? `/api/voice/clip/clip-${id}?exp=123&sig=abc`
                : `/api/voice/clip/clip-${id}`,
          })),
        })),
      }),
    );

    await waitFor(() => expect(result.current.lines[0]?.clipUrl).toMatch(/sig=abc/));
    expect(result.current.lines[0].clipUrl).toMatch(
      /^https?:\/\/.+\/api\/voice\/clip\/clip-a0\?exp=123&sig=abc$/,
    );
    expect(result.current.lines[1].clipUrl).toMatch(
      /^https?:\/\/.+\/api\/voice\/clip\/clip-a1$/,
    );
  });

  it("falls back to device speech on a 403, silently, and says the voice is premium", async () => {
    const client = makeClient({
      voiceSession: jest.fn(async () => {
        throw new ApiError(403, "forbidden", "The real voice is part of Saydle premium.");
      }),
    });
    const { result } = await setup(client);

    await waitFor(() => expect(result.current.voiceLocked).toBe(true));
    // The session still opens: seven lines, no clips, the phone reads them.
    expect(result.current.ready).toBe(true);
    expect(result.current.lines).toHaveLength(SESSION_SIZE);
    expect(result.current.lines.every((l) => l.clipUrl === null)).toBe(true);
  });

  it("does not mistake being offline for the paywall", async () => {
    const client = makeClient({
      voiceSession: jest.fn(async () => {
        throw new NetworkError(new Error("offline"));
      }),
    });
    const { result } = await setup(client);

    await waitFor(() => expect(result.current.ready).toBe(true));
    await waitFor(() => expect(client.voiceSession).toHaveBeenCalled());
    expect(result.current.voiceLocked).toBe(false);
    expect(result.current.lines.every((l) => l.clipUrl === null)).toBe(true);
  });
});
