import { render, fireEvent, waitFor } from "@testing-library/react-native";
import Library from "../../app/(dashboard)/library.jsx";
import { AuthProvider } from "../../contexts/AuthContext.jsx";
import { ApiError } from "../../lib/errors.js";

jest.mock("expo-router", () => ({
  useFocusEffect: (cb) => {
    const { useEffect } = require("react");
    useEffect(() => cb(), [cb]);
  },
  useRouter: () => ({ push: jest.fn() }),
}));

const USER = { id: "u1", firstName: "Ada", email: "ada@example.com" };

const lines = (n) =>
  Array.from({ length: n }, (_, i) => ({ id: `a${i}`, text: `Line ${i}` }));

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
  loadFavorites: jest.fn(async () => []),
  saveFavorites: jest.fn(async () => {}),
  loadOutbox: jest.fn(async () => []),
  saveOutbox: jest.fn(async () => {}),
  clear: jest.fn(async () => {}),
});

const makeClient = (over = {}) => ({
  me: jest.fn(async () => ({ user: USER })),
  library: jest.fn(async () => ({
    affirmations: lines(5),
    cursor: 0,
    total: 240,
    remaining: 240,
    refilling: false,
  })),
  librarySeen: jest.fn(async () => ({ cursor: 0 })),
  favorites: jest.fn(async () => ({ favorites: [] })),
  saved: jest.fn(async () => ({ saved: [] })),
  addFavorite: jest.fn(async () => {}),
  removeFavorite: jest.fn(async () => {}),
  addSaved: jest.fn(async () => {}),
  removeSaved: jest.fn(async () => {}),
  ...over,
});

const renderScreen = (client = makeClient()) =>
  render(
    <AuthProvider store={makeStore()} cache={makeCache()} client={client}>
      <Library />
    </AuthProvider>,
  );

describe("Library screen", () => {
  it("shows a line to sit with", async () => {
    const { findByText } = await renderScreen();
    expect(await findByText("Line 0")).toBeTruthy();
  });

  it("offers a heart and a bookmark, separately", async () => {
    const { findAllByTestId } = await renderScreen();

    expect((await findAllByTestId("library-favorite")).length).toBeGreaterThan(0);
    expect((await findAllByTestId("library-save")).length).toBeGreaterThan(0);
  });

  it("bookmarking does not silently favourite", async () => {
    const client = makeClient();
    const { findAllByTestId } = await renderScreen(client);

    await fireEvent.press((await findAllByTestId("library-save"))[0]);

    await waitFor(() => expect(client.addSaved).toHaveBeenCalledWith("a0"));
    expect(client.addFavorite).not.toHaveBeenCalled();
  });

  it("explains the paywall rather than showing an empty screen", async () => {
    const client = makeClient({
      library: jest.fn(async () => {
        throw new ApiError(403, { message: "premium" });
      }),
    });

    const { findByTestId } = await renderScreen(client);
    expect(await findByTestId("library-locked")).toBeTruthy();
  });

  /**
   * The drift bug, pinned.
   *
   * `getItemLayout` says where each page starts and the page style says how tall
   * it is. Held in a ref, the measured height arrived without a re-render, so
   * rendered pages kept the old value while `getItemLayout` reported the new
   * one — and paging accumulates offsets, so the content walked down the screen
   * a little further with every swipe until it left entirely.
   */
  it("lays every page out at exactly the height it reports", async () => {
    const { findByTestId, findAllByTestId } = await renderScreen();

    const container = await findByTestId("library-list");
    await fireEvent(container, "layout", { nativeEvent: { layout: { height: 700 } } });

    await waitFor(async () => {
      const page = (await findAllByTestId("library-page"))[0];
      expect(page.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ height: 700 })]),
      );
    });

    const list = await findByTestId("library-list");
    const { length, offset } = list.props.getItemLayout(null, 3);

    // The two readings must agree, or the error compounds per page.
    expect(length).toBe(700);
    expect(offset).toBe(2100);
  });
});
