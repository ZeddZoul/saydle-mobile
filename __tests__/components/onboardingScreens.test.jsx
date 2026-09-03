import { render, fireEvent } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import OnboardingStep from "../../components/onboarding/OnboardingStep.jsx";
import StreakPreview from "../../components/onboarding/StreakPreview.jsx";
import BenefitsPanel from "../../components/onboarding/BenefitsPanel.jsx";
import { ONBOARDING_QUESTIONS } from "../../lib/onboardingQuestions.js";
import { DEFAULT_REMINDER_WINDOW } from "../../lib/reminders.js";

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

  it("saves the window it showed, even if the slider was never touched", async () => {
    const onChange = jest.fn();
    const view = await renderStep({ question, value: undefined, onChange });

    await fireEvent.press(await view.findByText("Allow and save"));

    // The screen said "3× between 09:00 and 22:00"; accepting that is choosing
    // it. It used to persist nothing, so a reader who tapped Allow got no
    // reminders at all.
    expect(onChange).toHaveBeenCalledWith(DEFAULT_REMINDER_WINDOW);
  });

  it("leaves a window the reader set alone", async () => {
    const onChange = jest.fn();
    const view = await renderStep({
      question,
      value: { count: 5, start: "08:00", end: "20:00" },
      onChange,
    });

    await fireEvent.press(await view.findByText("Allow and save"));

    expect(onChange).not.toHaveBeenCalled();
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

  it("never makes anyone disclose something personal to get in", () => {
    // Name, mood and its causes, why they came, the inner critic, what
    // supports their wellbeing — a therapist or a breakup is nobody's price
    // of admission to an affirmation.
    const personal = [
      "callName",
      "ageBand",
      "recentMood",
      "feelingCauses",
      "relationshipStatus",
      "motivation",
      "innerCritic",
      "religion",
      "mentalHealthPractices",
      "weighing",
    ];
    const mandatory = ONBOARDING_QUESTIONS.filter(
      (q) => personal.includes(q.key) && !q.skippable,
    ).map((q) => q.key);

    expect(mandatory).toEqual([]);
  });

  it("marks every sensitive question skippable", () => {
    const stuck = ONBOARDING_QUESTIONS.filter((q) => q.sensitive && !q.skippable);
    expect(stuck.map((q) => q.key)).toEqual([]);
  });

  it("still requires the account fields", () => {
    const account = ONBOARDING_QUESTIONS.filter((q) => ["email", "password"].includes(q.key));
    expect(account.every((q) => !q.skippable)).toBe(true);
  });
});
