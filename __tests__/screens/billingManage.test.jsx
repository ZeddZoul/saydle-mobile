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

/** A free reader: the curated bank, and the one thing they can buy. */
const FREE = { status: "none", entitled: false, verified: false };

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
   * A free reader must be able to pay, and it must be the only way in.
   *
   * There is no trial: the curated bank is the free product, and buying is what
   * swaps it for affirmations written for them.
   */
  it("offers a free reader something to buy", async () => {
    mockPurchases.getOffering.mockResolvedValue({
      available: true,
      packages: [{ identifier: "monthly", product: { priceString: "$4.99" } }],
    });

    const { findByText } = await renderBilling(FREE);

    expect(await findByText(/Written for you, not for everyone/i)).toBeTruthy();
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
    expect(queryByText(/Written for you, not for everyone/i)).toBeNull();
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

    const { findByText } = await renderBilling(FREE);
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

    const { findByText, queryByText } = await renderBilling(FREE);
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
    // The status line, not the disclosure's "Renews automatically…", which
    // describes the plan on offer rather than the account.
    expect(queryByText(/Renews (?!automatically)/i)).toBeNull();
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

  /**
   * The webhook lands after the purchase resolves, not before.
   *
   * The store confirms, tells RevenueCat, RevenueCat posts to us — so the read
   * taken the moment `purchasePackage` returns is too early and sees the
   * pre-purchase state. There used to be exactly one attempt, and the only
   * other trigger was the AppState listener, which needs the app backgrounded.
   * The result was a paid-up screen still saying "Free" until the user found
   * Restore on their own.
   */
  it("keeps asking the server until the purchase lands", async () => {
    mockPurchases.getOffering.mockResolvedValue({
      available: true,
      packages: [{ identifier: "monthly", product: { priceString: "$4.99" } }],
    });
    mockPurchases.purchasePackage.mockResolvedValue({ available: true, purchased: true });

    // Not entitled on the first reads; the webhook lands on the third.
    let call = 0;
    const client = makeClient();
    client.subscription = jest.fn(async () => {
      call += 1;
      return {
        subscription:
          call >= 3
            ? { status: "active", entitled: true, verified: true, source: "app_store" }
            : { status: "none", entitled: false, verified: false },
      };
    });

    const { findByText } = await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <AuthProvider store={makeStore()} cache={makeCache()} client={client}>
          <ToastProvider>
            <Billing />
          </ToastProvider>
        </AuthProvider>
      </SafeAreaProvider>,
    );

    await fireEvent.press(await findByText(/Subscribe now — \$4\.99/));

    // More than one read after the purchase is the whole point.
    await waitFor(() => expect(client.subscription.mock.calls.length).toBeGreaterThan(2), {
      timeout: 15000,
    });
  }, 20000);

  /**
   * What the stores require next to a buy button: the length of each term,
   * the price per term, that it renews, and where to cancel — plus the two
   * documents. All of it derived from the offering, none of it typed here.
   */
  it("discloses the term, the renewal and the documents under the plans", async () => {
    mockPurchases.getOffering.mockResolvedValue({
      available: true,
      packages: [
        {
          identifier: "annual",
          packageType: "ANNUAL",
          product: {
            title: "Saydle Premium Yearly",
            priceString: "$49.99",
            subscriptionPeriod: "P1Y",
          },
        },
        {
          identifier: "monthly",
          packageType: "MONTHLY",
          product: {
            title: "Saydle Premium Monthly",
            priceString: "$9.99",
            subscriptionPeriod: "P1M",
          },
        },
      ],
    });

    const { findByTestId, findByText } = await renderBilling(FREE);

    await findByTestId("subscription-disclosure");
    expect(await findByText(/Saydle Premium Yearly · 1 year · \$49\.99 per year/)).toBeTruthy();
    expect(
      await findByText(/Saydle Premium Monthly · 1 month · \$9\.99 per month/),
    ).toBeTruthy();
    expect(
      await findByText(/Renews automatically at the same price until cancelled/),
    ).toBeTruthy();
    expect(await findByTestId("legal-terms")).toBeTruthy();
    expect(await findByTestId("legal-privacy")).toBeTruthy();
  });

  it("opens the documents from the disclosure", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    mockPurchases.getOffering.mockResolvedValue({
      available: true,
      packages: [
        { identifier: "monthly", packageType: "MONTHLY", product: { priceString: "$9.99" } },
      ],
    });

    const { findByTestId } = await renderBilling(FREE);
    await fireEvent.press(await findByTestId("legal-privacy"));

    await waitFor(() => expect(openURL).toHaveBeenCalledWith(expect.stringMatching(/privacy/)));
    openURL.mockRestore();
  });

  it("has no disclosure to make when there is nothing to buy", async () => {
    mockPurchases.getOffering.mockResolvedValue({ available: true, packages: [] });
    const { findByText, queryByTestId } = await renderBilling(FREE);

    await findByText(/Written for you, not for everyone/i);
    expect(queryByTestId("subscription-disclosure")).toBeNull();
  });

  it("names a promotional grant rather than calling it a trial", async () => {
    const { findByText } = await renderBilling({
      status: "active",
      entitled: true,
      verified: true,
      source: "promotional",
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    });

    await findByText(/Purchased via/i);
    expect(await findByText("Promotional")).toBeTruthy();
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

/**
 * The sample line is the paywall's whole argument.
 *
 * A promise that Saydle will write for you is worth far less than one sentence
 * proving it — their name, their situation, generated at signup. It is also
 * allowed to be absent (the model was down, or AI is off in this environment),
 * and the card has to survive that without a hole in it.
 */
describe("the sample line", () => {
  const withSub = (sub) =>
    render(
      <SafeAreaProvider initialMetrics={metrics}>
        <AuthProvider store={makeStore()} cache={makeCache()} client={makeClient(sub)}>
          <ToastProvider>
            <Billing />
          </ToastProvider>
        </AuthProvider>
      </SafeAreaProvider>,
    );

  it("shows what Saydle actually wrote for them", async () => {
    const { findByText } = await withSub({
      ...FREE,
      sampleLine: "You can be steady about this, Ada, without being certain.",
    });

    expect(
      await findByText("You can be steady about this, Ada, without being certain."),
    ).toBeTruthy();
  });

  it("omits the card entirely when there is no sample", async () => {
    const { findByText, queryByText } = await withSub({ ...FREE, sampleLine: null });

    await findByText(/Written for you, not for everyone/i);
    // No empty quote box, no placeholder — the argument is simply made without it.
    expect(queryByText(/Here's one Saydle wrote for you/i)).toBeNull();
  });

  it("does not pitch to someone who already pays", async () => {
    const { findByText, queryByText } = await withSub({
      status: "active",
      entitled: true,
      verified: true,
      sampleLine: "You can be steady about this, Ada, without being certain.",
    });

    await findByText(/Manage or cancel/i);
    expect(queryByText(/Written for you, not for everyone/i)).toBeNull();
  });
});
