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

const makeClient = (sub) => ({
  me: jest.fn(async () => ({ user: USER })),
  subscription: jest.fn(async () => ({
    subscription: sub ?? { status: "active", entitled: true, verified: true },
  })),
  favorites: jest.fn(async () => ({ favorites: [] })),
});

const TRIALING = {
  status: "trialing",
  entitled: true,
  verified: false,
  trialEndsAt: new Date(Date.now() + 2 * 86400000).toISOString(),
};

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderBilling = (sub) =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <AuthProvider store={makeStore()} cache={makeCache()} client={makeClient(sub)}>
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

  /**
   * Someone on a trial must be able to pay.
   *
   * The card was gated on `!entitled`, and a trial grants entitlement — so the
   * only people actively deciding whether to subscribe were the only people
   * with no way to do it. They had to wait for their access to lapse first.
   */
  it("lets someone on a trial subscribe without waiting for it to lapse", async () => {
    mockPurchases.getOffering.mockResolvedValue({
      available: true,
      packages: [{ identifier: "monthly", product: { priceString: "$4.99" } }],
    });

    const { findByText } = await renderBilling(TRIALING);

    expect(await findByText(/Become a member now/i)).toBeTruthy();
    // The buyable control, not the standing price line — both carry the price.
    expect(await findByText(/Subscribe now — \$4\.99/)).toBeTruthy();
  });

  it("hides the upgrade card from someone who already pays", async () => {
    mockPurchases.getOffering.mockResolvedValue({
      available: true,
      packages: [{ identifier: "monthly", product: { priceString: "$4.99" } }],
    });

    const { queryByText, findByText } = await renderBilling({
      status: "active",
      entitled: true,
      verified: true,
    });

    await findByText(/Manage or cancel/i);
    // Nothing left to sell them.
    expect(queryByText(/Become a member now/i)).toBeNull();
    expect(queryByText(/Go premium/i)).toBeNull();
  });

  it("says nothing was charged when a purchase fails", async () => {
    mockPurchases.getOffering.mockResolvedValue({
      available: true,
      packages: [{ identifier: "monthly", product: { priceString: "$4.99" } }],
    });
    mockPurchases.purchasePackage.mockResolvedValue({
      available: true,
      purchased: false,
      error: new Error("store said no"),
    });

    const { findByText } = await renderBilling(TRIALING);
    await fireEvent.press(await findByText(/Subscribe now — \$4\.99/));

    // It used to say "Couldn't save that. Try again." — the generic save
    // failure. Nothing was being saved, and the one thing someone needs after a
    // failed payment is to know their money is where they left it.
    expect(await findByText(/you haven't been charged/i)).toBeTruthy();
  });

  it("stays silent when someone simply declines", async () => {
    mockPurchases.getOffering.mockResolvedValue({
      available: true,
      packages: [{ identifier: "monthly", product: { priceString: "$4.99" } }],
    });
    mockPurchases.purchasePackage.mockResolvedValue({
      available: true,
      purchased: false,
      cancelled: true,
    });

    const { findByText, queryByText } = await renderBilling(TRIALING);
    await fireEvent.press(await findByText(/Subscribe now — \$4\.99/));

    // Declining is the commonest outcome of a paywall. An error aimed at
    // someone who just said no is the app arguing with them.
    await waitFor(() => expect(mockPurchases.purchasePackage).toHaveBeenCalled());
    expect(queryByText(/haven't been charged/i)).toBeNull();
  });

  /**
   * A lapsed subscription leaves its dates and its store behind.
   *
   * `expiresAt` and `source` both outlive the thing they describe, so the card
   * showed "Free" alongside "Renews August 15" and "Purchased via App Store" —
   * telling someone with no subscription that they renew next month and had
   * bought one. Every line in that card has to agree with the status above it.
   */
  it("never tells a lapsed account that it renews", async () => {
    const { findByText, queryByText } = await renderBilling({
      status: "expired",
      entitled: false,
      source: "app_store",
      expiresAt: new Date(Date.now() - 86400000).toISOString(),
    });

    expect(await findByText(/Ended /i)).toBeTruthy();
    expect(queryByText(/Renews /i)).toBeNull();
  });

  it("does not claim a purchase on an account that has none", async () => {
    const { findByText, queryByText } = await renderBilling({
      status: "expired",
      entitled: false,
      source: "app_store",
      expiresAt: new Date(Date.now() - 86400000).toISOString(),
    });

    await findByText(/Ended /i);
    expect(queryByText(/Purchased via/i)).toBeNull();
  });

  it("still shows the store while a subscription is live", async () => {
    const { findByText } = await renderBilling({
      status: "active",
      entitled: true,
      verified: true,
      source: "app_store",
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    });

    expect(await findByText(/Purchased via/i)).toBeTruthy();
    expect(await findByText("App Store")).toBeTruthy();
    expect(await findByText(/Renews /i)).toBeTruthy();
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
