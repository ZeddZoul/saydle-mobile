import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Locked from "../../app/(dashboard)/locked.jsx";
import { AuthProvider } from "../../contexts/AuthContext.jsx";
import { ToastProvider } from "../../contexts/ToastContext.jsx";

jest.mock("expo-router", () => ({
  useFocusEffect: (cb) => require("react").useEffect(cb, [cb]),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), canGoBack: () => false }),
  useLocalSearchParams: jest.fn(() => ({})),
}));

const mockRouter = jest.requireMock("expo-router");

// The real ladder waits six seconds before its first re-read, which is right on
// a phone waiting for a webhook and pointless in a test. The delays themselves
// are pinned in __tests__/lib/settle.test.js; what matters here is that the
// screen keeps asking and stops when the answer changes.
jest.mock("../../lib/settle.js", () => ({
  ...jest.requireActual("../../lib/settle.js"),
  // The long last rung matters: with every rung short, a test asserting "the
  // banner cleared" passes whether the server agreed or the ladder simply ran
  // out, which is the difference the test exists to see.
  SLOW_SETTLE: [0, 20, 60_000],
}));

// The factory cannot close over a const: jest.mock is hoisted above every
// declaration in the file, so a closure reads it as undefined at import time.
jest.mock("../../lib/purchases.js", () => ({
  purchasesAvailable: jest.fn(() => true),
  ensureConfigured: jest.fn(async () => ({ available: true })),
  identifyUser: jest.fn(async () => ({ available: true })),
  getOffering: jest.fn(async () => ({ available: true, packages: [] })),
  purchasePackage: jest.fn(async () => ({ available: true, purchased: true })),
  restorePurchases: jest.fn(async () => ({ available: true, entitled: false })),
  monthlyEquivalent: jest.requireActual("../../lib/purchases.js").monthlyEquivalent,
}));

const mockPurchases = jest.requireMock("../../lib/purchases.js");

const USER = { id: "u1", firstName: "Ada", email: "ada@example.com" };

/** What the route guard sends here: signed in, nothing bought. */
const UNPAID = { status: "none", entitled: false, verified: false };

/** What the server answers once the webhook has landed. */
const PAID = { status: "active", entitled: true, verified: true };

const ANNUAL = {
  identifier: "$rc_annual",
  packageType: "ANNUAL",
  product: { title: "Saydle Premium, Annual", priceString: "$49.99", price: 49.99 },
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
  clear: jest.fn(async () => {}),
});

/**
 * `after` is what the server answers from the second read onwards.
 *
 * A purchase is not believed until the server says so, and `useSubscription`
 * polls until the answer *changes* — so a client that returns one fixed value
 * models a webhook that never arrived, and the settle loop runs its full
 * minute. Handing it a second answer is what lets a successful purchase finish
 * inside the test rather than after it.
 */
const makeClient = (sub, after) => {
  let reads = 0;

  return {
    me: jest.fn(async () => ({ user: USER })),
    subscription: jest.fn(async () => ({
      subscription: (reads++ === 0 ? sub : (after ?? sub)) ?? UNPAID,
    })),
    favorites: jest.fn(async () => ({ favorites: [] })),
    signOut: jest.fn(async () => ({})),
  };
};

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderClient = (client) =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <AuthProvider store={makeStore()} cache={makeCache()} client={client}>
        <ToastProvider>
          <Locked />
        </ToastProvider>
      </AuthProvider>
    </SafeAreaProvider>,
  );

const renderLocked = (sub, after) =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <AuthProvider store={makeStore()} cache={makeCache()} client={makeClient(sub, after)}>
        <ToastProvider>
          <Locked />
        </ToastProvider>
      </AuthProvider>
    </SafeAreaProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  // clearAllMocks resets calls, NOT implementations: a mockResolvedValue set by
  // one test would silently govern every test after it, and the failure would
  // land on whichever test ran next rather than the one that caused it.
  mockPurchases.purchasesAvailable.mockReturnValue(true);
  mockPurchases.ensureConfigured.mockResolvedValue({ available: true });
  mockPurchases.identifyUser.mockResolvedValue({ available: true });
  mockPurchases.getOffering.mockResolvedValue({ available: true, packages: [] });
  mockPurchases.purchasePackage.mockResolvedValue({ available: true, purchased: true });
  mockPurchases.restorePurchases.mockResolvedValue({ available: true, entitled: false });
  mockRouter.useLocalSearchParams.mockReturnValue({});
});

/**
 * The only screen an account that has not paid can reach.
 *
 * Which makes it four screens at once, and each of the four is load-bearing:
 * the offer, restore, the terms, and the way out. Losing any one of them is
 * either a rejection at App Review or a reader trapped in an account.
 */
describe("the locked screen", () => {
  it("leads with the argument for subscribing", async () => {
    const { findByText } = await renderLocked();

    expect(await findByText(/Saydle is written for you/i)).toBeTruthy();
  });

  it("offers what there is to buy, with the store's own price", async () => {
    mockPurchases.getOffering.mockResolvedValue({ available: true, packages: [ANNUAL] });

    const { findByText } = await renderLocked();

    // The price comes from the package, never from a literal in the repo — the
    // store is the authority on what something costs in a given country.
    expect(await findByText(/Saydle Premium, Annual — \$49\.99/)).toBeTruthy();
  });

  it("does the monthly arithmetic for an annual plan", async () => {
    mockPurchases.getOffering.mockResolvedValue({
      available: true,
      packages: [{ ...ANNUAL, product: { ...ANNUAL.product, currencyCode: "USD" } }],
    });

    const { findByText } = await renderLocked();

    expect(await findByText(/USD 4\.17 a month/)).toBeTruthy();
  });

  it("waits rather than claiming the store is broken", async () => {
    // An offering is a round-trip to RevenueCat. For that second every visitor
    // was told "purchases aren't available on this device" — the sentence a
    // reviewer would screenshot, and never true when it was shown.
    let release;
    mockPurchases.getOffering.mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve({ available: true, packages: [ANNUAL] });
      }),
    );

    const { findByTestId, queryByText, findByText } = await renderLocked();

    expect(await findByTestId("locked-offering")).toBeTruthy();
    expect(queryByText(/aren't available on this device/i)).toBeNull();

    release();
    expect(await findByText(/Saydle Premium, Annual — \$49\.99/)).toBeTruthy();
  });

  it("says so plainly when there is nothing to sell, rather than showing a dead button", async () => {
    mockPurchases.getOffering.mockResolvedValue({ available: false, packages: [] });

    const { findByText, queryByText } = await renderLocked();

    expect(await findByText(/aren't available on this device/i)).toBeTruthy();
    expect(queryByText(/Saydle Premium, Annual/)).toBeNull();
  });

  /**
   * Proof where we have it, promise where we do not.
   *
   * The card is captioned "here's one Saydle wrote for you", so it may only
   * ever hold a line the model actually wrote for this account. When generation
   * never landed there is nothing truthful to put in it.
   */
  it("shows the line Saydle wrote for this person when there is one", async () => {
    const { findByText, queryByText } = await renderLocked({
      ...UNPAID,
      sampleLine: "You are allowed to begin again.",
    });

    expect(await findByText("You are allowed to begin again.")).toBeTruthy();
    expect(await findByText(/Here's one Saydle wrote for you/i)).toBeTruthy();
    // The promises are the substitute for proof, not a companion to it.
    expect(queryByText(/A new line each morning/i)).toBeNull();
  });

  it("falls back to the promises rather than inventing a sample", async () => {
    const { findByText, queryByText } = await renderLocked();

    expect(await findByText(/A new line each morning/i)).toBeTruthy();
    expect(queryByText(/Here's one Saydle wrote for you/i)).toBeNull();
  });

  it("promises only what a subscription actually buys", async () => {
    const { findByText, queryByText } = await renderLocked();

    await findByText(/A new line each morning/i);
    // The old copy promised "offline access to your saved favorites", which
    // under a hard paywall is not something an unpaid reader has at all.
    expect(queryByText(/offline access/i)).toBeNull();
  });

  it("buys through the account, never as the SDK's anonymous customer", async () => {
    mockPurchases.getOffering.mockResolvedValue({ available: true, packages: [ANNUAL] });

    const { findByText } = await renderLocked(UNPAID, PAID);
    await fireEvent.press(await findByText(/Saydle Premium, Annual — \$49\.99/));

    await waitFor(() => expect(mockPurchases.purchasePackage).toHaveBeenCalled());
    // A purchase made while the SDK is still its anonymous customer reaches our
    // webhook as `$RCAnonymousID:…` and grants nobody anything.
    expect(mockPurchases.identifyUser).toHaveBeenCalledWith(USER.id);
    // And it is only called done once the server, not the store, says so.
    expect(await findByText(/You're subscribed/i)).toBeTruthy();
  });

  it("says nothing was charged when a purchase fails", async () => {
    mockPurchases.getOffering.mockResolvedValue({ available: true, packages: [ANNUAL] });
    mockPurchases.purchasePackage.mockResolvedValue({
      available: true,
      purchased: false,
      error: new Error("store said no"),
    });

    const { findByText } = await renderLocked();
    await fireEvent.press(await findByText(/Saydle Premium, Annual — \$49\.99/));

    expect(await findByText(/you haven't been charged/i)).toBeTruthy();
  });

  /**
   * Required by Apple wherever a subscription is sold, and the only way back in
   * for someone who reinstalled. It is a link rather than a second filled
   * button — findable, not competing with the thing being sold.
   */
  it("restores an earlier purchase", async () => {
    mockPurchases.restorePurchases.mockResolvedValue({ available: true, entitled: true });

    const { findByText } = await renderLocked();
    await fireEvent.press(await findByText(/Restore purchases/i));

    await waitFor(() => expect(mockPurchases.restorePurchases).toHaveBeenCalled());
    // The store knows about the purchase before our webhook does, so the
    // screen says it landed rather than pretending nothing happened.
    expect(await findByText(/Found your purchase/i)).toBeTruthy();
  });

  it("tells someone with nothing to restore which account to check", async () => {
    const { findByText } = await renderLocked();
    await fireEvent.press(await findByText(/Restore purchases/i));

    expect(await findByText(/No earlier purchase/i)).toBeTruthy();
  });

  /** App Review 3.1.2: the terms belong beside the subscription CTA. */
  it("links the terms and the privacy policy at saydle.com", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    const { findByText } = await renderLocked();

    await fireEvent.press(await findByText(/Terms of Use/i));
    await fireEvent.press(await findByText(/Privacy Policy/i));

    await waitFor(() => expect(openURL).toHaveBeenCalledTimes(2));
    // The marketing site, not the API host: these are the URLs the store
    // listings point at, so they have to be the ones the app opens.
    expect(openURL.mock.calls[0][0]).toBe("https://saydle.com/terms");
    expect(openURL.mock.calls[1][0]).toBe("https://saydle.com/privacy");
    openURL.mockRestore();
  });

  it("offers a way to ask before paying", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    const { findByText } = await renderLocked();

    await fireEvent.press(await findByText(/support@saydle\.com/i));

    await waitFor(() => expect(openURL).toHaveBeenCalled());
    expect(openURL.mock.calls[0][0]).toMatch(/^mailto:support@saydle\.com/);
    openURL.mockRestore();
  });

  /**
   * Arriving here straight after paying.
   *
   * The store confirms a sale long before our webhook does — eighty seconds, in
   * one real measurement. Onboarding waits nine of them and sends the rest here
   * rather than holding a spinner, so this screen has to know the difference
   * between someone deciding and someone who has already decided.
   */
  describe("a sale still in flight", () => {
    it("says the payment landed instead of selling to them again", async () => {
      mockRouter.useLocalSearchParams.mockReturnValue({ settling: "1" });

      const { findByText } = await renderLocked();

      expect(await findByText(/Payment received/i)).toBeTruthy();
    });

    it("keeps asking until the server agrees", async () => {
      mockRouter.useLocalSearchParams.mockReturnValue({ settling: "1" });
      const client = makeClient(UNPAID, PAID);

      const { queryByText } = await renderClient(client);

      // The banner clears because the second answer came back entitled, not
      // because the ladder ran out — the mocked ladder's last rung is a minute
      // long, so exhaustion cannot be what happened inside this test.
      await waitFor(() => expect(queryByText(/Payment received/i)).toBeNull());
      expect(client.subscription.mock.calls.length).toBeGreaterThan(1);
    });

    /**
     * Syncing entitlement into the session is the whole job here.
     *
     * This screen cannot navigate, and for a while nothing else did either: the
     * poll landed, `entitled` went true, and the route guard answered null, so
     * the payer sat on the plan buttons. The guard owns the exit now
     * (lib/routeGuard.js), and __tests__/lib/routeGuard.test.js pins it.
     */
    it("re-reads the session, which is what the guard consults", async () => {
      mockRouter.useLocalSearchParams.mockReturnValue({ settling: "1" });
      const client = makeClient(UNPAID, PAID);

      await renderClient(client);

      await waitFor(() => expect(client.me.mock.calls.length).toBeGreaterThan(0));
    });

    it("says nothing to someone who is merely deciding", async () => {
      const { findByText, queryByText } = await renderLocked();

      await findByText(/Saydle is written for you/i);
      expect(queryByText(/Payment received/i)).toBeNull();
    });
  });

  /**
   * The way out. Behind the same gate as everything else this would be a trap:
   * someone signed in as the wrong person with no way back, and an account
   * nobody can delete. Deletion has to be reachable inside the app (App Store
   * guideline 5.1.1(v)) and the privacy policy promises it.
   */
  it("names the account it is signed in as", async () => {
    const { findByText } = await renderLocked();

    expect(await findByText(/ada@example\.com/)).toBeTruthy();
  });

  it("can sign out", async () => {
    const { findByText } = await renderLocked();

    expect(await findByText(/Sign out/i)).toBeTruthy();
  });

  it("can delete the account without paying first", async () => {
    const { findByTestId } = await renderLocked();

    await fireEvent.press(await findByTestId("locked-delete"));

    // The confirmation sheet, which is where the deletion actually happens.
    expect(await findByTestId("delete-sheet")).toBeTruthy();
    expect(await findByTestId("delete-submit")).toBeTruthy();
  });
});
