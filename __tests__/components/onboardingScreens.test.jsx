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
/**
 * Consent where the data is given.
 *
 * Guideline 5.1.2 wants permission before user data goes to a third party, and
 * the onboarding free text is the most personal thing Saydle holds: how someone
 * has been feeling, what they want to stop believing. It goes to Google Vertex.
 * A linked privacy policy is the full disclosure; this is the part nobody
 * should have to go looking for before they answer.
 */
describe("the third-party disclosure", () => {
  const { ONBOARDING_QUESTIONS: QUESTIONS } = require("../../lib/onboardingQuestions.js");

  const flagged = QUESTIONS.filter((q) => q.aiNote);

  it("is carried by a question that actually collects free text", () => {
    expect(flagged.length).toBeGreaterThan(0);
    for (const q of flagged) expect(q.kind).toBe("text");
  });

  it("is said once rather than on all ten text steps", () => {
    // Repeated on every step it stops being read, which is the same as not
    // saying it.
    expect(flagged).toHaveLength(1);
  });

  it("appears before anything personal has been typed", async () => {
    const [question] = flagged;
    const view = await renderStep({ question, value: "" });

    expect(
      await view.findByText(/sent to the service that writes your affirmations/i),
    ).toBeTruthy();
  });

  it("says the answer can be skipped, and means it", async () => {
    const [question] = flagged;
    const view = await renderStep({ question, value: "" });

    expect(await view.findByText(/skip any question/i)).toBeTruthy();
    expect(question.skippable).toBe(true);
  });

  it("stays off the steps that ask for nothing personal", async () => {
    const theme = QUESTIONS.find((q) => q.kind === "theme");
    const view = await renderStep({ question: theme, value: undefined });

    expect(view.queryByText(/sent to the service/i)).toBeNull();
  });
});

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

  /**
   * The only way off this screen.
   *
   * Someone who already subscribes can end up here by tapping "Get started"
   * instead of "Login", and until now the flow had no exit: no back, no skip,
   * and a purchase they should not be asked to make twice. A reviewer doing the
   * same thing is a 2.1 rejection.
   */
  it("offers a way out to someone who already subscribes", async () => {
    const onSignIn = jest.fn();
    const view = await renderPaywall({ onSignIn });

    await fireEvent.press(await view.findByTestId("paywall-signin"));

    expect(onSignIn).toHaveBeenCalled();
  });

  it("calls it signing in rather than restoring", async () => {
    const view = await renderPaywall({ onSignIn: () => {} });

    // A restore here would land the receipt on RevenueCat's anonymous customer:
    // there is no account yet, and entitlement is held by the Saydle account.
    expect(await view.findByText(/Sign in/i)).toBeTruthy();
    expect(view.queryByText(/Restore/i)).toBeNull();
  });

  it("prices from the store, never from a literal in the repo", async () => {
    const view = await renderPaywall();

    expect(await view.findByText(/Saydle Premium, Annual — \$49\.99/)).toBeTruthy();
  });
});
