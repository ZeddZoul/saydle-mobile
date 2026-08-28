import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../../contexts/AuthContext.jsx";
import { ToastProvider } from "../../contexts/ToastContext.jsx";
import MyWords from "../../app/(dashboard)/my-words.jsx";
import { ApiError } from "../../lib/errors.js";

// The screen refreshes entitlement on focus, which needs a navigation container.
// Running the callback once on mount is the behaviour under test.
jest.mock("expo-router", () => ({
  useFocusEffect: (cb) => require("react").useEffect(cb, [cb]),
  // The floating header replaced the navigator's, and it navigates back itself.
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: () => true,
  }),
}));

const USER = { id: "u1", firstName: "Ada" };

const entitled = { entitled: true, status: "trialing", verified: false };
const unentitled = { entitled: false, status: "none", verified: false };

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
    loadFeed: jest.fn(async () => null),
    saveFeed: jest.fn(async () => {}),
    loadFavorites: jest.fn(async () => null),
    saveFavorites: jest.fn(async () => {}),
    loadOutbox: jest.fn(async () => []),
    saveOutbox: jest.fn(async () => {}),
    clear: jest.fn(async () => {}),
  };
}

const baseClient = ({ subscription = entitled, list = [], over = {} } = {}) => ({
  me: jest.fn(async () => ({ user: USER })),
  subscription: jest.fn(async () => ({ subscription })),
  startTrial: jest.fn(),
  customAffirmations: jest.fn(async () => ({ affirmations: list })),
  createCustomAffirmation: jest.fn(async (text) => ({
    affirmation: { id: "c1", text, source: "custom" },
  })),
  deleteCustomAffirmation: jest.fn(async () => {}),
  ...over,
});

// ToastProvider reads safe-area insets, which have no value under test unless
// a provider supplies them.
const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderMyWords = (client = baseClient()) =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <AuthProvider store={makeStore()} cache={makeCache()} client={client}>
        <ToastProvider>
          <MyWords />
        </ToastProvider>
      </AuthProvider>
    </SafeAreaProvider>,
  );

describe("MyWords", () => {
  it("explains the feature rather than hiding it when it isn't paid for", async () => {
    const { findByTestId, findByText } = await renderMyWords(
      baseClient({ subscription: unentitled }),
    );

    // Someone who came looking should learn what it is, not find an empty screen.
    await findByTestId("my-words-locked");
    expect(await findByText(/part of Saydle premium/i)).toBeTruthy();
  });

  it("does not ask the server for words it isn't allowed to show", async () => {
    const client = baseClient({ subscription: unentitled });
    await renderMyWords(client);

    await waitFor(() => expect(client.subscription).toHaveBeenCalled());
    expect(client.createCustomAffirmation).not.toHaveBeenCalled();
  });

  it("saves what the reader writes", async () => {
    const client = baseClient();
    const { findByLabelText, findByText } = await renderMyWords(client);

    await fireEvent.changeText(
      await findByLabelText("Your affirmation"),
      "  I can begin again on a Tuesday.  ",
    );
    await fireEvent.press(await findByText("Save it"));

    // Trimmed, because trailing whitespace is a typo not a choice.
    await waitFor(() =>
      expect(client.createCustomAffirmation).toHaveBeenCalledWith(
        "I can begin again on a Tuesday.",
      ),
    );
  });

  it("will not save an empty sentence", async () => {
    const client = baseClient();
    const { findByText, findByLabelText } = await renderMyWords(client);

    await fireEvent.changeText(await findByLabelText("Your affirmation"), "   ");
    await fireEvent.press(await findByText("Save it"));

    expect(client.createCustomAffirmation).not.toHaveBeenCalled();
  });

  it("shows the new one straight away and clears the field", async () => {
    const { findByLabelText, findByText } = await renderMyWords();
    const input = await findByLabelText("Your affirmation");

    await fireEvent.changeText(input, "I can begin again on a Tuesday.");
    await fireEvent.press(await findByText("Save it"));

    await findByText("I can begin again on a Tuesday.");
    await waitFor(() => expect(input.props.value).toBe(""));
  });

  it("surfaces the server's reason when it declines one", async () => {
    const client = baseClient({
      over: {
        createCustomAffirmation: jest.fn(async () => {
          throw new ApiError(400, "bad_request", "Let's not set this one as a daily reminder.");
        }),
      },
    });
    const { findByLabelText, findByText } = await renderMyWords(client);

    await fireEvent.changeText(await findByLabelText("Your affirmation"), "something hard");
    await fireEvent.press(await findByText("Save it"));

    // The refusal has a reason, and the reader should read it.
    expect(await findByText(/Let's not set this one/)).toBeTruthy();
  });

  it("lists what was written before", async () => {
    const { findByText } = await renderMyWords(
      baseClient({ list: [{ id: "c1", text: "An older one.", source: "custom" }] }),
    );

    expect(await findByText("An older one.")).toBeTruthy();
  });

  it("asks before deleting, and deletes on confirmation", async () => {
    const spy = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      buttons.find((b) => b.style === "destructive").onPress();
    });

    const client = baseClient({
      list: [{ id: "c1", text: "An older one.", source: "custom" }],
    });
    const { findByLabelText } = await renderMyWords(client);

    await fireEvent.press(await findByLabelText('Delete "An older one."'));

    await waitFor(() => expect(client.deleteCustomAffirmation).toHaveBeenCalledWith("c1"));
    spy.mockRestore();
  });

  it("puts a failed delete back rather than claiming it is gone", async () => {
    const spy = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      buttons.find((b) => b.style === "destructive").onPress();
    });

    const client = baseClient({
      list: [{ id: "c1", text: "An older one.", source: "custom" }],
      over: {
        deleteCustomAffirmation: jest.fn(async () => {
          throw new ApiError(500, "server_error", "Something went wrong.");
        }),
      },
    });

    const { findByLabelText, findByText } = await renderMyWords(client);
    await fireEvent.press(await findByLabelText('Delete "An older one."'));

    expect(await findByText("An older one.")).toBeTruthy();
    spy.mockRestore();
  });
});

describe("MyWords — entitlement freshness", () => {
  it("re-reads entitlement on focus, so a trial started elsewhere unlocks it", async () => {
    // Caught on device: the tab screen stays mounted, so a mount-only fetch left
    // the paywall showing after the trial had already started server-side.
    const client = baseClient({ subscription: unentitled });
    const { findByTestId } = await renderMyWords(client);

    await findByTestId("my-words-locked");
    expect(client.subscription).toHaveBeenCalled();
  });

  it("shows the composer once the account is entitled", async () => {
    const { findByLabelText, queryByTestId } = await renderMyWords();

    expect(await findByLabelText("Your affirmation")).toBeTruthy();
    expect(queryByTestId("my-words-locked")).toBeNull();
  });
});
