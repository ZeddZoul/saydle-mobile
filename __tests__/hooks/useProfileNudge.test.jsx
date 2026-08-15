import { renderHook, waitFor, act } from "@testing-library/react-native";
import { AuthProvider } from "../../contexts/AuthContext.jsx";
import { useProfileNudge } from "../../hooks/useProfileNudge.js";
import { ApiError, NetworkError } from "../../lib/errors.js";
import { todayLocal, addDays } from "../../lib/dates.js";

const USER = { id: "u1", firstName: "Ada" };

const SUGGESTIONS = [
  {
    key: "values",
    kind: "multi",
    label: "What matters to you",
    options: ["growth"],
    sensitive: false,
  },
  { key: "religion", kind: "single", label: "Faith", options: ["yes"], sensitive: true },
];

const PAYLOAD = {
  profile: { innerCritic: "harsh" },
  completeness: { filled: 4, total: 20, percent: 20 },
  suggestions: SUGGESTIONS,
};

// Past the grace period, so the hook is free to nudge.
const READY = { snoozedUntil: "2000-01-01", dismissals: 0, answered: 0 };

function makeStore() {
  return {
    hasSession: jest.fn(async () => true),
    getAccessToken: jest.fn(async () => "a1"),
    getRefreshToken: jest.fn(async () => "r1"),
    setSession: jest.fn(async () => {}),
    clear: jest.fn(async () => {}),
  };
}

function makeCache({ profile = null, nudge = READY } = {}) {
  return {
    loadUser: jest.fn(async () => USER),
    saveUser: jest.fn(async () => {}),
    loadFeed: jest.fn(async () => null),
    saveFeed: jest.fn(async () => {}),
    loadFavorites: jest.fn(async () => null),
    saveFavorites: jest.fn(async () => {}),
    loadProfile: jest.fn(async () => profile),
    saveProfile: jest.fn(async () => {}),
    loadNudgeState: jest.fn(async () => nudge),
    saveNudgeState: jest.fn(async () => {}),
    loadOutbox: jest.fn(async () => []),
    saveOutbox: jest.fn(async () => {}),
    clear: jest.fn(async () => {}),
  };
}

const renderNudge = ({ cache, client }) =>
  renderHook(() => useProfileNudge(), {
    wrapper: ({ children }) => (
      <AuthProvider store={makeStore()} cache={cache} client={client}>
        {children}
      </AuthProvider>
    ),
  });

const baseClient = (over = {}) => ({
  me: jest.fn(async () => ({ user: USER })),
  profile: jest.fn(async () => PAYLOAD),
  updateProfile: jest.fn(async () => PAYLOAD),
  ...over,
});

describe("useProfileNudge", () => {
  it("surfaces the first suggestion and caches the profile payload", async () => {
    const cache = makeCache();
    const { result } = await renderNudge({ cache, client: baseClient() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.suggestion.key).toBe("values");
    expect(result.current.completeness.percent).toBe(20);
    expect(cache.saveProfile).toHaveBeenCalledWith("u1", PAYLOAD);
  });

  it("seeds a grace period on a device that has never nudged", async () => {
    const cache = makeCache({ nudge: null });
    const { result } = await renderNudge({ cache, client: baseClient() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // A brand-new account is not asked for more the moment onboarding ends.
    expect(result.current.suggestion).toBeNull();
    expect(cache.saveNudgeState).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ snoozedUntil: addDays(todayLocal(), 2) }),
    );
  });

  it("nudges from cache when the profile fetch cannot reach the server", async () => {
    const cache = makeCache({ profile: PAYLOAD });
    const client = baseClient({
      profile: jest.fn(async () => {
        throw new NetworkError(new Error("offline"));
      }),
    });

    const { result } = await renderNudge({ cache, client });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.suggestion.key).toBe("values");
  });

  it("saves an answer and then goes quiet for the cooldown", async () => {
    const answered = {
      ...PAYLOAD,
      completeness: { filled: 5, total: 20, percent: 25 },
      suggestions: [SUGGESTIONS[1]],
    };
    const cache = makeCache();
    const client = baseClient({ updateProfile: jest.fn(async () => answered) });

    const { result } = await renderNudge({ cache, client });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.answer("values", ["growth"]);
    });

    expect(client.updateProfile).toHaveBeenCalledWith({ values: ["growth"] });
    expect(result.current.completeness.percent).toBe(25);
    // The next question exists but is not asked yet.
    expect(result.current.suggestion).toBeNull();
    expect(result.current.pending.key).toBe("religion");
  });

  it("queues an answer given with no signal instead of refusing it", async () => {
    const cache = makeCache();
    const client = baseClient({
      updateProfile: jest.fn(async () => {
        throw new NetworkError(new Error("offline"));
      }),
    });

    const { result } = await renderNudge({ cache, client });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.answer("values", ["growth"]);
    });

    // Someone who answered has answered — don't make them type it again later.
    expect(cache.saveOutbox).toHaveBeenCalledWith("u1", [
      expect.objectContaining({ kind: "profile", payload: { values: ["growth"] } }),
    ]);
    expect(result.current.pending.key).toBe("religion");
  });

  it("lets a refusal from the server through, rather than queueing it forever", async () => {
    const cache = makeCache();
    const client = baseClient({
      updateProfile: jest.fn(async () => {
        throw new ApiError(400, "invalid", "Not a valid value.");
      }),
    });

    const { result } = await renderNudge({ cache, client });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.answer("values", ["nope"])).rejects.toThrow(ApiError);
    });

    expect(cache.saveOutbox).not.toHaveBeenCalled();
    expect(result.current.suggestion.key).toBe("values");
  });

  it("backs off on dismiss and persists it, so a relaunch doesn't re-ask", async () => {
    const cache = makeCache();
    const { result } = await renderNudge({ cache, client: baseClient() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.dismiss();
    });

    expect(result.current.suggestion).toBeNull();
    expect(cache.saveNudgeState).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ dismissals: 1, snoozedUntil: addDays(todayLocal(), 4) }),
    );
  });

  it("still offers the question on Profile while the nudge is snoozed", async () => {
    const cache = makeCache({ nudge: { snoozedUntil: "2099-01-01", dismissals: 3 } });
    const { result } = await renderNudge({ cache, client: baseClient() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Backing off is about not interrupting — it must not hide what someone
    // deliberately went looking for.
    expect(result.current.suggestion).toBeNull();
    expect(result.current.pending.key).toBe("values");
  });
});
