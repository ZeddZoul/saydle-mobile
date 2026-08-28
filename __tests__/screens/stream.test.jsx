import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { AuthProvider } from "../../contexts/AuthContext.jsx";
import Stream from "../../app/(dashboard)/stream.jsx";
import { todayLocal } from "../../lib/dates.js";
import { NetworkError } from "../../lib/errors.js";

const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
}));

const USER = { id: "u1", firstName: "Ada" };
const TODAY = todayLocal();

const entry = (date, text) => ({
  date,
  seenAt: `${date}T09:00:00Z`,
  affirmation: { id: `a-${date}`, text, categorySlug: "calm" },
});

function makeStore() {
  return {
    hasSession: jest.fn(async () => true),
    getAccessToken: jest.fn(async () => "a1"),
    getRefreshToken: jest.fn(async () => "r1"),
    setSession: jest.fn(async () => {}),
    clear: jest.fn(async () => {}),
  };
}

function makeCache() {
  return {
    loadUser: jest.fn(async () => USER),
    saveUser: jest.fn(async () => {}),
    loadFeed: jest.fn(async () => ({
      today: TODAY,
      entries: [entry(TODAY, "Today's line.")],
    })),
    saveFeed: jest.fn(async () => {}),
    loadFavorites: jest.fn(async () => []),
    saveFavorites: jest.fn(async () => {}),
    loadOutbox: jest.fn(async () => []),
    saveOutbox: jest.fn(async () => {}),
    clear: jest.fn(async () => {}),
  };
}

const baseClient = (over = {}) => ({
  me: jest.fn(async () => ({ user: USER })),
  feed: jest.fn(async () => ({ today: TODAY, entries: [entry(TODAY, "Today's line.")] })),
  markSeen: jest.fn(async () => ({ ok: true })),
  favorites: jest.fn(async () => ({ favorites: [] })),
  addFavorite: jest.fn(async () => ({ ok: true })),
  removeFavorite: jest.fn(async () => ({ ok: true })),
  history: jest.fn(async () => ({
    today: TODAY,
    entries: [entry("2026-08-04", "Yesterday's line."), entry("2026-08-03", "The day before.")],
  })),
  ...over,
});

const renderStream = (client = baseClient()) =>
  render(
    <AuthProvider store={makeStore()} cache={makeCache()} client={client}>
      <Stream />
    </AuthProvider>,
  );

beforeEach(() => mockBack.mockClear());

describe("Stream", () => {
  it("opens on today, with the days already read below it", async () => {
    const { findByText } = await renderStream();

    expect(await findByText("Today's line.")).toBeTruthy();
    expect(await findByText("Yesterday's line.")).toBeTruthy();
  });

  it("puts today first", async () => {
    const { findAllByTestId, findByText } = await renderStream();
    await findByText("Yesterday's line.");

    const pages = await findAllByTestId("stream-page");
    expect(pages).toHaveLength(3);
  });

  it("labels today as today and older days by their date", async () => {
    const { findByText, queryByText } = await renderStream();

    expect(await findByText("Today")).toBeTruthy();
    // Not a raw ISO date in front of the reader.
    expect(queryByText("2026-08-04")).toBeNull();
  });

  it("never asks the server for anything ahead of today", async () => {
    const client = baseClient();
    await renderStream(client);

    await waitFor(() => expect(client.history).toHaveBeenCalled());
    // The whole stream runs backwards; there is no forward call to make.
    expect(client.feed).toHaveBeenCalled();
    expect(client.history.mock.calls[0][0]).not.toHaveProperty("after");
  });

  it("pages one screen at a time rather than free-scrolling", async () => {
    const { findByTestId } = await renderStream();

    // A scrollable list turns a sentence to sit with into an inbox.
    expect((await findByTestId("stream-list")).props.pagingEnabled).toBe(true);
  });

  it("favourites the affirmation on the page you're looking at", async () => {
    const client = baseClient();
    const { findAllByLabelText } = await renderStream(client);

    const hearts = await findAllByLabelText("Save to favorites");
    await fireEvent.press(hearts[0]);

    await waitFor(() => expect(client.addFavorite).toHaveBeenCalledWith(`a-${TODAY}`));
  });

  it("closes back to where it came from", async () => {
    const { findByTestId } = await renderStream();

    await fireEvent.press(await findByTestId("stream-close"));
    expect(mockBack).toHaveBeenCalled();
  });

  it("still opens offline, on today alone", async () => {
    const client = baseClient({
      history: jest.fn(async () => {
        throw new NetworkError(new Error("offline"));
      }),
    });

    const { findByText, queryByText } = await renderStream(client);

    // Today comes from the cached feed, so the stream is never empty.
    expect(await findByText("Today's line.")).toBeTruthy();
    expect(queryByText("Yesterday's line.")).toBeNull();
  });

  it("stops asking for more once the history runs out", async () => {
    const client = baseClient({
      history: jest.fn(async () => ({ today: TODAY, entries: [] })),
    });

    const { findByTestId } = await renderStream(client);
    const list = await findByTestId("stream-list");

    await fireEvent(list, "onEndReached");
    await fireEvent(list, "onEndReached");

    // One call on mount; the empty page marks it exhausted.
    await waitFor(() => expect(client.history).toHaveBeenCalledTimes(1));
  });
});
