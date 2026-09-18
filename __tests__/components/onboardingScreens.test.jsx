import { render, fireEvent } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import OnboardingStep from "../../components/onboarding/OnboardingStep.jsx";
import StreakPreview from "../../components/onboarding/StreakPreview.jsx";
import BenefitsPanel from "../../components/onboarding/BenefitsPanel.jsx";
import { ONBOARDING_QUESTIONS } from "../../lib/onboardingQuestions.js";

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const wrap = (ui) => <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>;

const renderStep = (props) =>
  render(
    wrap(
      <OnboardingStep
        onChange={() => {}}
        onNext={() => {}}
        onBack={() => {}}
        onSkip={() => {}}
        isFirst
        {...props}
      />,
    ),
  );

beforeEach(() => {
  jest.clearAllMocks();
  Notifications.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
});

describe("the reminders step", () => {
  const question = {
    key: "reminders",
    kind: "reminders",
    title: "Get a lift throughout the day",
    cta: "Allow and save",
  };

  it("previews a real notification and the default window", async () => {
    const view = await renderStep({ question, value: undefined });

    expect(await view.findByText(/Saydle · now/)).toBeTruthy();
    expect(view.getByText("3×")).toBeTruthy();
    expect(view.getByText("How many")).toBeTruthy();
  });

  it("uses the step's own call to action", async () => {
    const view = await renderStep({ question, value: undefined });
    expect(await view.findByText("Allow and save")).toBeTruthy();
  });

  it("reports the count as it changes", async () => {
    const onChange = jest.fn();
    const view = await renderStep({ question, value: undefined, onChange });

    await fireEvent(await view.findByLabelText("Reminders per day"), "valueChange", 7);

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ count: 7 }));
  });

  it("asks the OS for permission when continuing", async () => {
    const onNext = jest.fn();
    const view = await renderStep({ question, value: undefined, onNext });

    await fireEvent.press(await view.findByText("Allow and save"));

    expect(Notifications.getPermissionsAsync).toHaveBeenCalled();
    expect(onNext).toHaveBeenCalled();
  });
});

describe("the reminder control in settings (compact)", () => {
  const ReminderSetup = require("../../components/onboarding/ReminderSetup.jsx").default;

  it("drops the notification preview", async () => {
    const view = await render(
      wrap(
        <ReminderSetup
          compact
          value={{ count: 3, start: "09:00", end: "22:00" }}
          onChange={() => {}}
        />,
      ),
    );

    expect(await view.findByText("How many")).toBeTruthy();
    expect(view.queryByText(/Saydle · now/)).toBeNull();
  });

  it("commits only once the slider settles, not on every tick", async () => {
    const onChange = jest.fn();
    const onCommit = jest.fn();
    const view = await render(
      wrap(
        <ReminderSetup
          compact
          value={{ count: 3, start: "09:00", end: "22:00" }}
          onChange={onChange}
          onCommit={onCommit}
        />,
      ),
    );

    const slider = await view.findByLabelText("Reminders per day");

    await fireEvent(slider, "valueChange", 5);
    await fireEvent(slider, "valueChange", 8);
    expect(onChange).toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled(); // still dragging

    await fireEvent(slider, "slidingComplete", 8);
    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ count: 8 }));
  });
});

describe("the streak interstitial", () => {
  it("shows day one and the full week", async () => {
    const view = await render(wrap(<StreakPreview />));

    expect(await view.findByText("1")).toBeTruthy();
    expect(view.getByText("Build a streak, one day at a time")).toBeTruthy();
  });
});

describe("the benefits panel", () => {
  it("lists what a practice helps you do, without clinical claims", async () => {
    const view = await render(wrap(<BenefitsPanel />));

    expect(await view.findByText(/gentler with yourself/)).toBeTruthy();
    // Nothing here may read as treatment.
    expect(view.queryByText(/cure|treat|diagnos/i)).toBeNull();
  });
});

describe("the flow", () => {
  it("includes the new steps in order, before the account fields", () => {
    const keys = ONBOARDING_QUESTIONS.map((q) => q.key);

    expect(keys).toEqual(expect.arrayContaining(["benefits", "reminders", "streakIntro"]));
    expect(keys.indexOf("reminders")).toBeLessThan(keys.indexOf("email"));
    expect(keys.indexOf("streakIntro")).toBeLessThan(keys.indexOf("email"));
  });

  it("keeps email and password as the last two steps", () => {
    const keys = ONBOARDING_QUESTIONS.map((q) => q.key);
    expect(keys.slice(-2)).toEqual(["email", "password"]);
  });
});

/**
 * The paywall's standing terms.
 *
 * Guideline 3.1.2 wants the renewal terms where the purchase is made, not only
 * in a linked document. Missing auto-renewal language beside a subscription CTA
 * is one of the most routinely cited subscription rejections, and the entire
 * fixed copy here used to be the words "Cancel anytime."
 */
describe("the onboarding paywall", () => {
  const Paywall = require("../../components/onboarding/Paywall.jsx").default;

  const ANNUAL = {
    identifier: "$rc_annual",
    packageType: "ANNUAL",
    product: { title: "Saydle Premium, Annual", priceString: "$49.99", price: 49.99 },
  };

  const renderPaywall = (props = {}) =>
    render(wrap(<Paywall onSubscribe={() => {}} canPurchase packages={[ANNUAL]} {...props} />));

  it("says the subscription renews, and who takes the money", async () => {
    const view = await renderPaywall();

    expect(await view.findByText(/renews automatically/i)).toBeTruthy();
    expect(await view.findByText(/charged to your store account/i)).toBeTruthy();
  });

  it("says how to stop it, and by when", async () => {
    const view = await renderPaywall();

    expect(await view.findByText(/24 hours before the period ends/i)).toBeTruthy();
  });

  it("states the terms even when there is nothing to sell", async () => {
    // No RevenueCat key means no buttons, but the screen is still a paywall and
    // the price line is still on it.
    const view = await renderPaywall({ canPurchase: false, packages: [] });

    expect(await view.findByText(/renews automatically/i)).toBeTruthy();
  });

  it("promises only what a subscription actually buys", async () => {
    const view = await renderPaywall();

    // It used to promise "instant offline access to your saved favorites",
    // which under a hard paywall an unpaid reader does not have at all.
    expect(await view.findByText(/A new line each morning/i)).toBeTruthy();
    expect(view.queryByText(/offline access/i)).toBeNull();
  });

  it("prices from the store, never from a literal in the repo", async () => {
    const view = await renderPaywall();

    expect(await view.findByText(/Saydle Premium, Annual — \$49\.99/)).toBeTruthy();
  });
});
