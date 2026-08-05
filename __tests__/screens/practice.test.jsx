import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { AuthProvider } from "../../contexts/AuthContext.jsx";
import Practice from "../../app/(dashboard)/practice.jsx";
import { todayLocal } from "../../lib/dates.js";
import { DEFAULT_TARGET } from "../../lib/practice.js";

const USER = { id: "u1", firstName: "Ada" };
const TODAY = todayLocal();
const AFFIRMATION = { id: "a1", text: "I am allowed to start small.", categorySlug: "calm" };

function makeStore() {
  return {
    hasSession: jest.fn(async () => true),
    getAccessToken: jest.fn(async () => "a1"),
    getRefreshToken: jest.fn(async () => "r1"),
    setSession: jest.fn(async () => {}),
    clear: jest.fn(async () => {}),
  };
}

function makeCache({ practice = null } = {}) {
  return {
    loadUser: jest.fn(async () => USER),
    saveUser: jest.fn(async () => {}),
    loadFeed: jest.fn(async () => ({
      today: TODAY,
      entries: [{ date: TODAY, seenAt: null, affirmation: AFFIRMATION }],
    })),
    saveFeed: jest.fn(async () => {}),
    loadFavorites: jest.fn(async () => null),
    saveFavorites: jest.fn(async () => {}),
    loadOutbox: jest.fn(async () => []),
    saveOutbox: jest.fn(async () => {}),
    loadPractice: jest.fn(async () => practice),
    savePractice: jest.fn(async () => {}),
    clear: jest.fn(async () => {}),
  };
}

const client = () => ({
  me: jest.fn(async () => ({ user: USER })),
  feed: jest.fn(async () => ({
    today: TODAY,
    entries: [{ date: TODAY, seenAt: null, affirmation: AFFIRMATION }],
  })),
  markSeen: jest.fn(async () => ({ ok: true })),
});

const renderPractice = (cache = makeCache()) =>
  render(
    <AuthProvider store={makeStore()} cache={cache} client={client()}>
      <Practice />
    </AuthProvider>,
  );

describe("Practice", () => {
  it("shows today's affirmation to say", async () => {
    const { findByText } = await renderPractice();
    expect(await findByText("I am allowed to start small.")).toBeTruthy();
  });

  // The dots are decoration: the count already reaches a screen reader through
  // the surface's own label, so they are hidden from the accessibility tree —
  // which is also why these queries have to opt into hidden elements.
  const HIDDEN = { includeHiddenElements: true };

  it("gives one dot per repetition to do", async () => {
    const { findAllByTestId } = await renderPractice();
    expect(await findAllByTestId("practice-dot", HIDDEN)).toHaveLength(DEFAULT_TARGET);
  });

  it("fills a dot on each tap of the whole surface", async () => {
    const { findByTestId, findAllByTestId } = await renderPractice();

    // The entire screen is the target — nothing to aim at mid-thought.
    await fireEvent.press(await findByTestId("practice-surface"));
    expect(await findAllByTestId("practice-dot-filled", HIDDEN)).toHaveLength(1);

    await fireEvent.press(await findByTestId("practice-surface"));
    expect(await findAllByTestId("practice-dot-filled", HIDDEN)).toHaveLength(2);
  });

  it("counts up in the label, for anyone not looking at the dots", async () => {
    const { findByTestId, findByText } = await renderPractice();

    await fireEvent.press(await findByTestId("practice-surface"));
    expect(await findByText(`1 of ${DEFAULT_TARGET}`)).toBeTruthy();
  });

  it("finishes at the target and says so by name", async () => {
    const { findByTestId, findByText } = await renderPractice();
    const surface = await findByTestId("practice-surface");

    for (let i = 0; i < DEFAULT_TARGET; i += 1) await fireEvent.press(surface);

    await findByTestId("practice-done");
    expect(await findByText(/That's it, Ada/)).toBeTruthy();
  });

  it("stores a finished session, so tomorrow's streak knows", async () => {
    const cache = makeCache();
    const { findByTestId } = await renderPractice(cache);
    const surface = await findByTestId("practice-surface");

    for (let i = 0; i < DEFAULT_TARGET; i += 1) await fireEvent.press(surface);

    await waitFor(() =>
      expect(cache.savePractice).toHaveBeenCalledWith("u1", [
        expect.objectContaining({ date: TODAY, affirmationId: "a1", completedAt: expect.any(String) }),
      ]),
    );
  });

  it("cannot be pushed past the target", async () => {
    const cache = makeCache();
    const { findByTestId, findAllByTestId } = await renderPractice(cache);
    const surface = await findByTestId("practice-surface");

    for (let i = 0; i < DEFAULT_TARGET + 5; i += 1) await fireEvent.press(surface);

    // A ritual with an end, not a score to maximise.
    expect(await findAllByTestId("practice-dot-filled", HIDDEN)).toHaveLength(DEFAULT_TARGET);
    expect(cache.savePractice).toHaveBeenCalledTimes(1);
  });

  it("offers to go again after finishing", async () => {
    const { findByTestId, findByText, findAllByTestId, queryByTestId } = await renderPractice();
    const surface = await findByTestId("practice-surface");

    for (let i = 0; i < DEFAULT_TARGET; i += 1) await fireEvent.press(surface);
    await fireEvent.press(await findByText("Once more"));

    await waitFor(() => expect(queryByTestId("practice-done")).toBeNull());
    expect(await findAllByTestId("practice-dot", HIDDEN)).toHaveLength(DEFAULT_TARGET);
  });

  it("resumes a session already finished today rather than asking again", async () => {
    const cache = makeCache({
      practice: [
        {
          date: TODAY,
          affirmationId: "a1",
          target: DEFAULT_TARGET,
          count: DEFAULT_TARGET,
          completedAt: `${TODAY}T09:00:00.000Z`,
        },
      ],
    });

    const { findByTestId } = await renderPractice(cache);
    expect(await findByTestId("practice-done")).toBeTruthy();
  });
});
