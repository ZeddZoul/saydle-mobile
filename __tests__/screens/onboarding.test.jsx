import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Onboarding from "../../app/onboarding.jsx";
import { AuthProvider } from "../../contexts/AuthContext.jsx";
import { ToastProvider } from "../../contexts/ToastContext.jsx";
import { DEFAULT_REMINDER_WINDOW } from "../../lib/reminders.js";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: (...a) => mockReplace(...a), push: jest.fn() }),
  useSegments: () => [],
}));

// Three steps instead of thirty-odd: the reminders step (the one that used to
// persist nothing), then the account. What is under test is the controller
// around the questions, not the questions.
jest.mock("../../lib/onboardingQuestions.js", () => ({
  ONBOARDING_QUESTIONS: [
    {
      key: "reminders",
      kind: "reminders",
      title: "Get a lift throughout the day",
      cta: "Allow and save",
      skippable: true,
    },
    {
      key: "email",
      kind: "text",
      inputType: "email",
      title: "Your email",
      placeholder: "you@x",
    },
    {
      key: "password",
      kind: "text",
      inputType: "password",
      title: "Create a password",
      placeholder: "At least 8 characters",
    },
  ],
  questionFor: () => null,
}));

jest.mock("../../lib/purchases.js", () => ({
  purchasesAvailable: jest.fn(() => false),
  configurePurchases: jest.fn(async () => ({ available: false })),
  getOffering: jest.fn(async () => ({ available: false, packages: [] })),
  purchasePackage: jest.fn(async () => ({ available: false })),
}));
const mockPurchases = jest.requireMock("../../lib/purchases.js");

const store = () => ({
  hasSession: jest.fn(async () => false),
  getAccessToken: jest.fn(async () => null),
  getRefreshToken: jest.fn(async () => null),
  setSession: jest.fn(async () => {}),
  clear: jest.fn(async () => {}),
});

const cache = () => ({
  loadUser: jest.fn(async () => null),
  saveUser: jest.fn(async () => {}),
  loadFeed: jest.fn(async () => null),
  saveFeed: jest.fn(async () => {}),
  loadFavorites: jest.fn(async () => null),
  saveFavorites: jest.fn(async () => {}),
  loadOutbox: jest.fn(async () => []),
  saveOutbox: jest.fn(async () => {}),
  clear: jest.fn(async () => {}),
});

const makeClient = () => ({
  me: jest.fn(async () => ({ user: { id: "u1" } })),
  register: jest.fn(async () => ({
    user: { id: "u1", firstName: "Friend" },
    accessToken: "a1",
    refreshToken: "r1",
  })),
  updatePreferences: jest.fn(async (patch) => ({ preferences: patch })),
  updateProfile: jest.fn(async () => ({})),
});

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderFlow = (client = makeClient()) =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <AuthProvider store={store()} cache={cache()} client={client}>
        <ToastProvider>
          <Onboarding />
        </ToastProvider>
      </AuthProvider>
    </SafeAreaProvider>,
  );

/** Walks from the first step to the paywall. */
const reachPaywall = async (view, { skipReminders = false } = {}) => {
  if (skipReminders) await fireEvent.press(await view.findByText("Skip"));
  else await fireEvent.press(await view.findByText("Allow and save"));

  await fireEvent.changeText(await view.findByLabelText("Your email"), "ada@example.com");
  await fireEvent.press(await view.findByText("Continue"));

  await fireEvent.changeText(await view.findByLabelText("Create a password"), "longenough");
  await fireEvent.press(await view.findByText("Continue"));

  return view.findByTestId("paywall-free");
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPurchases.purchasesAvailable.mockReturnValue(false);
  mockPurchases.getOffering.mockResolvedValue({ available: false, packages: [] });
});

describe("the sign-up flow", () => {
  it("creates the account on the free plan, from the paywall", async () => {
    const client = makeClient();
    const view = await renderFlow(client);

    await fireEvent.press(await reachPaywall(view));

    await waitFor(() =>
      expect(client.register).toHaveBeenCalledWith(
        expect.objectContaining({ email: "ada@example.com", password: "longenough" }),
      ),
    );
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/dashboard"));
    // Nothing was bought and nothing pretended to be.
    expect(mockPurchases.purchasePackage).not.toHaveBeenCalled();
  });

  it("persists the reminder window the step showed", async () => {
    const client = makeClient();
    const view = await renderFlow(client);

    await fireEvent.press(await reachPaywall(view));

    // "Allow and save" with the slider untouched used to save nothing at all.
    await waitFor(() =>
      expect(client.updatePreferences).toHaveBeenCalledWith(
        expect.objectContaining({
          reminders: expect.objectContaining({ ...DEFAULT_REMINDER_WINDOW, enabled: true }),
        }),
      ),
    );
  });

  it("saves no reminders when the step was skipped", async () => {
    const client = makeClient();
    const view = await renderFlow(client);

    await fireEvent.press(await reachPaywall(view, { skipReminders: true }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/dashboard"));
    const sent = client.updatePreferences.mock.calls.map(([patch]) => patch);
    expect(sent.some((patch) => patch.reminders)).toBe(false);
  });

  it("goes back from the paywall to the last question", async () => {
    const view = await renderFlow();

    await reachPaywall(view);
    await fireEvent.press(await view.findByTestId("paywall-back"));

    // The password step, with the answer still in it.
    expect((await view.findByLabelText("Create a password")).props.value).toBe("longenough");
  });

  it("sends Restore purchases to sign-in, since there is no account to restore onto", async () => {
    const view = await renderFlow();

    await reachPaywall(view);
    await fireEvent.press(await view.findByTestId("paywall-restore"));

    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/login", params: { restore: "1" } });
  });

  it("offers a retry when the store answered with no plans", async () => {
    mockPurchases.purchasesAvailable.mockReturnValue(true);
    mockPurchases.getOffering.mockResolvedValue({ available: true, packages: [] });
    const view = await renderFlow();

    await reachPaywall(view);
    await view.findByTestId("paywall-plans-failed");

    mockPurchases.getOffering.mockResolvedValue({
      available: true,
      packages: [
        { identifier: "monthly", packageType: "MONTHLY", product: { priceString: "$9.99" } },
      ],
    });
    await fireEvent.press(await view.findByText("Try again"));

    expect(await view.findByTestId("paywall-plan-monthly")).toBeTruthy();
    expect(mockPurchases.getOffering).toHaveBeenCalledTimes(2);
  });

  it("buys the plan that was tapped, after the account exists", async () => {
    mockPurchases.purchasesAvailable.mockReturnValue(true);
    const monthly = {
      identifier: "monthly",
      packageType: "MONTHLY",
      product: { priceString: "$9.99" },
    };
    const annual = {
      identifier: "annual",
      packageType: "ANNUAL",
      product: { priceString: "$49.99" },
    };
    mockPurchases.getOffering.mockResolvedValue({
      available: true,
      packages: [annual, monthly],
    });
    mockPurchases.configurePurchases.mockResolvedValue({ available: true });
    mockPurchases.purchasePackage.mockResolvedValue({ available: true, purchased: true });
    const client = makeClient();
    const view = await renderFlow(client);

    await reachPaywall(view);
    await fireEvent.press(await view.findByTestId("paywall-plan-monthly"));

    await waitFor(() => expect(mockPurchases.purchasePackage).toHaveBeenCalledWith(monthly));
    expect(client.register).toHaveBeenCalled();
    expect(mockPurchases.configurePurchases).toHaveBeenCalledWith("u1");
  });
});
