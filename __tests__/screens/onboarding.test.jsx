import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Onboarding from "../../app/onboarding.jsx";
import { AuthProvider } from "../../contexts/AuthContext.jsx";
import { ToastProvider } from "../../contexts/ToastContext.jsx";
import { ONBOARDING_QUESTIONS as QUESTIONS } from "../../lib/onboardingQuestions.js";

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.requireMock("expo-router").__replace, push: jest.fn() }),
  useFocusEffect: (cb) => require("react").useEffect(cb, [cb]),
  useLocalSearchParams: () => ({}),
  __replace: jest.fn(),
}));

jest.mock("../../lib/purchases.js", () => ({
  purchasesAvailable: jest.fn(() => true),
  ensureConfigured: jest.fn(async () => ({ available: true })),
  identifyUser: jest.fn(async () => ({ available: true })),
  getOffering: jest.fn(async () => ({ available: true, packages: [] })),
  purchasePackage: jest.fn(async () => ({ available: true, purchased: true })),
  restorePurchases: jest.fn(async () => ({ available: true, entitled: false })),
  monthlyEquivalent: jest.requireActual("../../lib/purchases.js").monthlyEquivalent,
}));

// The real ladder spends nine seconds on the fast phase, which is right on a
// phone and pointless here. The delays are pinned in __tests__/lib/settle.test.js.
jest.mock("../../lib/settle.js", () => ({
  ...jest.requireActual("../../lib/settle.js"),
  FAST_SETTLE: [0, 5, 5],
}));

const mockPurchases = jest.requireMock("../../lib/purchases.js");
const mockRouter = jest.requireMock("expo-router");

const USER = { id: "u1", firstName: "Ada", email: "ada@example.com" };

const ANNUAL = {
  identifier: "$rc_annual",
  packageType: "ANNUAL",
  product: { title: "Saydle Premium, Annual", priceString: "$49.99", price: 49.99 },
};

const makeStore = () => ({
  hasSession: jest.fn(async () => false),
  getAccessToken: jest.fn(async () => null),
  getRefreshToken: jest.fn(async () => null),
  setSession: jest.fn(async () => {}),
  clear: jest.fn(async () => {}),
});

const makeCache = () => ({
  loadUser: jest.fn(async () => null),
  saveUser: jest.fn(async () => {}),
  loadFeed: jest.fn(async () => null),
  saveFeed: jest.fn(async () => {}),
  loadFavorites: jest.fn(async () => []),
  saveFavorites: jest.fn(async () => {}),
  loadOutbox: jest.fn(async () => []),
  saveOutbox: jest.fn(async () => {}),
  clear: jest.fn(async () => {}),
});

/** `entitledAfter` is how many reads pass before the webhook is said to have landed. */
const makeClient = ({ entitledAfter = 1 } = {}) => {
  let reads = 0;

  return {
    register: jest.fn(async () => ({
      user: USER,
      accessToken: "a1",
      refreshToken: "r1",
    })),
    me: jest.fn(async () => ({ user: USER })),
    subscription: jest.fn(async () => {
      const entitled = reads++ >= entitledAfter;
      return {
        subscription: { status: entitled ? "active" : "none", entitled, verified: entitled },
      };
    }),
    updateProfile: jest.fn(async () => ({})),
    updatePreferences: jest.fn(async () => ({ user: USER })),
    favorites: jest.fn(async () => ({ favorites: [] })),
  };
};

/** The funnel walk takes most of waitFor's default second on its own. */
const SETTLED = { timeout: 5000 };

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderOnboarding = (client) =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <AuthProvider store={makeStore()} cache={makeCache()} client={client}>
        <ToastProvider>
          <Onboarding />
        </ToastProvider>
      </AuthProvider>
    </SafeAreaProvider>,
  );

/**
 * Walks the questionnaire to the paywall.
 *
 * Driven off whatever step is actually on screen rather than off the question
 * list, because several questions only appear depending on an earlier answer
 * (`showIf`), so marching down the list walks into steps that were never
 * rendered. None of the answers matter here: this is about what happens once
 * the store answers.
 */
const reachPaywall = async (view) => {
  for (let step = 0; step < QUESTIONS.length + 5; step += 1) {
    const paywall = view.queryByText(/Saydle Premium, Annual/);
    if (paywall) return paywall;

    // Skippable steps are the cheapest route through, and a skip is a real
    // answer as far as the flow is concerned.
    const skip = view.queryByText("Skip");
    if (skip) {
      await fireEvent.press(skip);
      continue;
    }

    const question = QUESTIONS.find((q) => view.queryByText(q.title));
    if (!question) break;

    if (question.kind === "text") {
      const value =
        question.inputType === "email"
          ? "ada@example.com"
          : question.inputType === "password"
            ? "a-long-enough-password"
            : "Ada";

      await fireEvent.changeText(view.getByLabelText(question.title), value);
    } else if (question.kind === "single") {
      // Selecting advances on a timer of its own; there is no Continue here.
      await fireEvent.press(view.getByText(question.options[0].label));
      await waitFor(() => expect(view.queryByText(question.title)).toBeNull());
      continue;
    } else if (question.kind === "multi") {
      await fireEvent.press(view.getByText(question.options[0].label));
    }

    await fireEvent.press(view.getByText(question.cta ?? "Continue"));
  }

  return view.queryByText(/Saydle Premium, Annual/);
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRouter.__replace.mockReset();
  mockPurchases.purchasesAvailable.mockReturnValue(true);
  mockPurchases.ensureConfigured.mockResolvedValue({ available: true });
  mockPurchases.identifyUser.mockResolvedValue({ available: true });
  mockPurchases.getOffering.mockResolvedValue({ available: true, packages: [ANNUAL] });
  mockPurchases.purchasePackage.mockResolvedValue({ available: true, purchased: true });
});

/**
 * The end of the funnel, which is also where the account is created and the
 * money changes hands.
 *
 * None of this had a test. That is how it shipped navigating to /dashboard the
 * instant StoreKit returned, with the route guard bouncing the buyer back to
 * the paywall they had just paid to get past.
 */
describe("finishing onboarding", () => {
  it("reaches a paywall that offers the store's own price", async () => {
    const view = await renderOnboarding(makeClient());

    expect(await reachPaywall(view)).toBeTruthy();
  });

  it("creates the account and buys, in that order", async () => {
    const client = makeClient();
    const view = await renderOnboarding(client);

    await fireEvent.press(await reachPaywall(view));

    await waitFor(() => expect(mockPurchases.purchasePackage).toHaveBeenCalled(), SETTLED);
    // RevenueCat has to know our id before the card is charged, or the webhook
    // arrives as `$RCAnonymousID:…` and grants nobody anything.
    expect(client.register).toHaveBeenCalled();
    expect(mockPurchases.identifyUser).toHaveBeenCalledWith(USER.id);
  });

  it("opens the app once the server confirms the purchase", async () => {
    const view = await renderOnboarding(makeClient({ entitledAfter: 1 }));

    await fireEvent.press(await reachPaywall(view));

    await waitFor(
      () => expect(mockRouter.__replace).toHaveBeenCalledWith("/dashboard"),
      SETTLED,
    );
  });

  it("waits for the server rather than the store", async () => {
    const client = makeClient({ entitledAfter: 2 });
    const view = await renderOnboarding(client);

    await fireEvent.press(await reachPaywall(view));

    await waitFor(
      () => expect(mockRouter.__replace).toHaveBeenCalledWith("/dashboard"),
      SETTLED,
    );
    // More than one read means it did not believe the first answer, which is
    // the one taken before the webhook could possibly have landed.
    expect(client.subscription.mock.calls.length).toBeGreaterThan(1);
  });

  it("hands a slow webhook to the locked screen instead of holding a spinner", async () => {
    // A webhook was measured at eighty seconds. Nobody watches a spinner for
    // that, so the screen says the payment landed and keeps asking there.
    const view = await renderOnboarding(makeClient({ entitledAfter: 99 }));

    await fireEvent.press(await reachPaywall(view));

    await waitFor(
      () => expect(mockRouter.__replace).toHaveBeenCalledWith("/locked?settling=1"),
      SETTLED,
    );
  });

  it("sends someone who declined to the paywall, not through the dashboard", async () => {
    mockPurchases.purchasePackage.mockResolvedValue({
      available: true,
      purchased: false,
      cancelled: true,
    });

    const view = await renderOnboarding(makeClient());

    await fireEvent.press(await reachPaywall(view));

    await waitFor(() => expect(mockRouter.__replace).toHaveBeenCalledWith("/locked"), SETTLED);
    expect(mockRouter.__replace).not.toHaveBeenCalledWith("/dashboard");
  });

  it("does not charge a card the SDK cannot attribute to the account", async () => {
    mockPurchases.identifyUser.mockResolvedValue({
      available: false,
      error: new Error("network"),
    });

    const view = await renderOnboarding(makeClient());

    await fireEvent.press(await reachPaywall(view));

    await waitFor(() => expect(mockRouter.__replace).toHaveBeenCalledWith("/locked"), SETTLED);
    expect(mockPurchases.purchasePackage).not.toHaveBeenCalled();
  });

  it("offers a way out to someone who already subscribes", async () => {
    const view = await renderOnboarding(makeClient());
    await reachPaywall(view);

    await fireEvent.press(await view.findByTestId("paywall-signin"));

    expect(mockRouter.__replace).toHaveBeenCalledWith("/login");
  });
});
