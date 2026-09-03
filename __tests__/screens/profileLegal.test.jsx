import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Profile from "../../app/(dashboard)/profile.jsx";
import { AuthProvider } from "../../contexts/AuthContext.jsx";
import { ToastProvider } from "../../contexts/ToastContext.jsx";

jest.mock("expo-router", () => ({
  useFocusEffect: (cb) => require("react").useEffect(cb, [cb]),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}));

jest.mock("../../lib/purchases.js", () => ({
  purchasesAvailable: jest.fn(() => false),
  configurePurchases: jest.fn(async () => ({ available: false })),
  getOffering: jest.fn(async () => ({ available: false, packages: [] })),
  purchasePackage: jest.fn(async () => ({ available: false })),
  restorePurchases: jest.fn(async () => ({ available: false })),
}));

const USER = {
  id: "u1",
  firstName: "Ada",
  lastName: "L",
  email: "ada@example.com",
  preferences: { tone: "gentle", categories: [] },
};

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
  loadProfile: jest.fn(async () => null),
  saveProfile: jest.fn(async () => {}),
  loadNudgeState: jest.fn(async () => null),
  saveNudgeState: jest.fn(async () => {}),
  clear: jest.fn(async () => {}),
});

const makeClient = () => ({
  me: jest.fn(async () => ({ user: USER })),
  categories: jest.fn(async () => ({ categories: [] })),
  subscription: jest.fn(async () => ({
    subscription: { status: "none", entitled: false, verified: false },
  })),
  profile: jest.fn(async () => ({ profile: {}, completeness: { percent: 0, missing: [] } })),
});

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderProfile = () =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <AuthProvider store={makeStore()} cache={makeCache()} client={makeClient()}>
        <ToastProvider>
          <Profile />
        </ToastProvider>
      </AuthProvider>
    </SafeAreaProvider>,
  );

/**
 * The documents and the door to a human, reachable from inside the app.
 *
 * App Review looks for a privacy policy in-app; so does anyone deciding
 * whether to trust an app with how they have been feeling.
 */
describe("Profile — Legal", () => {
  it("opens the Privacy Policy, the Terms and a support email", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    const { findByTestId } = await renderProfile();

    await fireEvent.press(await findByTestId("legal-privacy"));
    await fireEvent.press(await findByTestId("legal-terms"));
    await fireEvent.press(await findByTestId("legal-support"));

    await waitFor(() => expect(openURL).toHaveBeenCalledTimes(3));
    expect(openURL.mock.calls[0][0]).toBe("https://saydle.app/privacy");
    expect(openURL.mock.calls[1][0]).toBe("https://saydle.app/terms");
    expect(openURL.mock.calls[2][0]).toMatch(/^mailto:support@saydle\.app\?subject=/);
    openURL.mockRestore();
  });

  it("says so when the device cannot open the link", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("no handler"));
    const { findByTestId, findByText } = await renderProfile();

    await fireEvent.press(await findByTestId("legal-privacy"));

    expect(await findByText(/Couldn't open that link/)).toBeTruthy();
    openURL.mockRestore();
  });

  it("exposes the tone chips as buttons", async () => {
    const { findByText } = await renderProfile();

    // A chip with no role is a plain view to a screen reader — tappable, but
    // never announced as something that can be tapped.
    expect((await findByText("Gentle")).parent.props.accessibilityRole).toBe("button");
  });
});
