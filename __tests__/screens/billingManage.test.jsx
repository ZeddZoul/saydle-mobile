import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Billing from "../../app/(dashboard)/billing.jsx";
import { AuthProvider } from "../../contexts/AuthContext.jsx";
import { ToastProvider } from "../../contexts/ToastContext.jsx";

jest.mock("expo-router", () => ({
  useFocusEffect: (cb) => require("react").useEffect(cb, [cb]),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}));

// The factory cannot close over a const: jest.mock is hoisted above every
// declaration in the file, so a closure reads it as undefined at import time.
jest.mock("../../lib/purchases.js", () => ({
  purchasesAvailable: jest.fn(() => true),
  configurePurchases: jest.fn(async () => ({ available: true })),
  getOffering: jest.fn(async () => ({ available: true, packages: [] })),
  purchasePackage: jest.fn(async () => ({ available: true, purchased: true })),
  restorePurchases: jest.fn(async () => ({ available: true, entitled: false })),
}));

const mockPurchases = jest.requireMock("../../lib/purchases.js");

const USER = { id: "u1", firstName: "Ada", email: "ada@example.com" };

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

const makeClient = () => ({
  me: jest.fn(async () => ({ user: USER })),
  subscription: jest.fn(async () => ({
    subscription: { status: "active", entitled: true, verified: true },
  })),
  favorites: jest.fn(async () => ({ favorites: [] })),
});

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderBilling = () =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <AuthProvider store={makeStore()} cache={makeCache()} client={makeClient()}>
        <ToastProvider>
          <Billing />
        </ToastProvider>
      </AuthProvider>
    </SafeAreaProvider>,
  );

beforeEach(() => jest.clearAllMocks());

/**
 * Managing a subscription, without RevenueCat's Customer Center.
 *
 * That sheet was dropped because it cannot be themed — its chrome is native
 * SwiftUI, and the only lever the SDK exposes is an accent colour. It also
 * showed the RevenueCat App User ID as "account details", and the only way to
 * make it show a person's name is to send RevenueCat that name.
 */
describe("managing a subscription", () => {
  it("sends cancellation to the store, which is the only place it can happen", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    const { findByTestId } = await renderBilling();

    await fireEvent.press(await findByTestId("billing-manage"));

    await waitFor(() => expect(openURL).toHaveBeenCalled());
    expect(openURL.mock.calls[0][0]).toMatch(/subscriptions/);
    openURL.mockRestore();
  });

  it("offers a refund route, separate from cancelling", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    const { findByTestId } = await renderBilling();

    await fireEvent.press(await findByTestId("billing-refund"));

    await waitFor(() => expect(openURL).toHaveBeenCalled());
    // Apple's self-serve flow, not the subscriptions pane — a refund and a
    // cancellation are different requests and must not share one button.
    expect(openURL.mock.calls[0][0]).toMatch(/reportaproblem|orderhistory/);
    openURL.mockRestore();
  });

  it("identifies the account by name and email, not an opaque id", async () => {
    const { findByText } = await renderBilling();

    // Read from our own session. RevenueCat's App User ID means nothing to the
    // reader, and populating it with a real name would put personal data in a
    // processor that purge.service.js cannot reach.
    expect(await findByText("Ada")).toBeTruthy();
    expect(await findByText("ada@example.com")).toBeTruthy();
  });

  it("tells someone what to try when there is nothing to restore", async () => {
    mockPurchases.restorePurchases.mockResolvedValue({ available: true, entitled: false });
    const { findByText } = await renderBilling();

    await fireEvent.press(await findByText("Restore purchases"));

    // "Nothing to restore" is a dead end. The common cause is a second store
    // account, so the copy has to name it.
    expect(await findByText(/sign in to it and try again/i)).toBeTruthy();
  });
});
