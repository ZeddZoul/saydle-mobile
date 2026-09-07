import { render, fireEvent, waitFor } from "@testing-library/react-native";
import Saved from "../../app/(dashboard)/saved.jsx";
import { AuthProvider } from "../../contexts/AuthContext.jsx";
import { ApiError, NetworkError } from "../../lib/errors.js";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, canGoBack: () => false, replace: jest.fn() }),
}));

const USER = { id: "u1", firstName: "Ada", email: "ada@example.com" };

const row = (id, text) => ({
  savedAt: "2026-09-01T09:00:00.000Z",
  affirmation: { id, text },
});

const makeStore = () => ({
  hasSession: jest.fn(async () => true),
  getAccessToken: jest.fn(async () => "a1"),
  getRefreshToken: jest.fn(async () => "r1"),
  setSession: jest.fn(async () => {}),
  clear: jest.fn(async () => {}),
});

const makeCache = () => {
  const store = new Map();
  return {
    loadUser: jest.fn(async () => USER),
    saveUser: jest.fn(async () => {}),
    loadFeed: jest.fn(async () => null),
    saveFeed: jest.fn(async () => {}),
    loadFavorites: jest.fn(async () => null),
    saveFavorites: jest.fn(async () => {}),
    loadOutbox: jest.fn(async () => []),
    saveOutbox: jest.fn(async () => {}),
    loadJson: jest.fn(async (_id, name) => store.get(name) ?? null),
    saveJson: jest.fn(async (_id, name, value) => void store.set(name, value)),
    clear: jest.fn(async () => {}),
  };
};

const makeClient = (over = {}) => ({
  me: jest.fn(async () => ({ user: USER })),
  saved: jest.fn(async () => ({ saved: [row("a1", "I can begin again.")] })),
  addSaved: jest.fn(async () => ({})),
  removeSaved: jest.fn(async () => ({})),
  ...over,
});

const renderScreen = async (client = makeClient()) => {
  const utils = await render(
    <AuthProvider store={makeStore()} cache={makeCache()} client={client}>
      <Saved />
    </AuthProvider>,
  );
  return { client, ...utils };
};

beforeEach(() => mockPush.mockClear());

/**
 * The shelf. Until this screen existed, the feed's bookmark was the one control
 * in the product that did something invisible — the server kept every save and
 * nothing ever showed them.
 */
describe("the saved shelf", () => {
  it("shows what was bookmarked", async () => {
    const { findByText } = await renderScreen();
    expect(await findByText("I can begin again.")).toBeTruthy();
  });

  it("promises rather than gapes when the shelf is empty", async () => {
    const client = makeClient({ saved: jest.fn(async () => ({ saved: [] })) });
    const { findByText } = await renderScreen(client);

    expect(await findByText(/Tap the bookmark/)).toBeTruthy();
  });

  it("removes a line from the shelf", async () => {
    const { findByTestId, client } = await renderScreen();

    await fireEvent.press(await findByTestId("saved-remove-a1"));

    await waitFor(() => expect(client.removeSaved).toHaveBeenCalledWith("a1"));
  });

  it("states the gate plainly for a free reader, and points at billing", async () => {
    const client = makeClient({
      saved: jest.fn(async () => {
        throw new ApiError(403, "forbidden", "Saving lines is premium.");
      }),
    });
    const { findByTestId } = await renderScreen(client);

    // Someone who came looking should learn what the shelf is, not find an
    // empty screen — and the way in should be one tap away.
    expect(await findByTestId("saved-locked")).toBeTruthy();
    await fireEvent.press(await findByTestId("saved-upgrade"));
    expect(mockPush).toHaveBeenCalledWith("/billing");
  });

  it("stays readable offline", async () => {
    const client = makeClient({
      saved: jest.fn(async () => {
        throw new NetworkError("offline");
      }),
    });
    const { findByText, queryByTestId } = await renderScreen(client);

    // Offline is a banner over the cached shelf, never a lock and never a
    // crash — the same rule every read surface follows.
    expect(await findByText(/Offline/)).toBeTruthy();
    expect(queryByTestId("saved-locked")).toBeNull();
  });
});
