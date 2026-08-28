import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import OnboardingStep from "../../components/onboarding/OnboardingStep.jsx";

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

// findBy* awaits the tree settling after the mount animation, so queries are
// order-independent across tests in the file.
const renderStep = (props) =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <OnboardingStep
        onChange={() => {}}
        onNext={() => {}}
        onBack={() => {}}
        onSkip={() => {}}
        isFirst
        {...props}
      />
    </SafeAreaProvider>,
  );

const single = {
  key: "tone",
  kind: "single",
  title: "How do you like to be spoken to?",
  options: [
    { value: "gentle", label: "Gently and softly" },
    { value: "grounded", label: "Warm and grounded" },
  ],
};

const multi = {
  key: "values",
  kind: "multi",
  title: "What matters most?",
  options: [
    { value: "family", label: "Family" },
    { value: "growth", label: "Growth" },
  ],
};

const text = {
  key: "goal",
  kind: "text",
  title: "What are you working toward?",
  placeholder: "Right now…",
};

describe("OnboardingStep — single select", () => {
  it("records the choice and auto-advances after a beat", async () => {
    const onChange = jest.fn();
    const onNext = jest.fn();
    const view = await renderStep({ question: single, onChange, onNext });

    await fireEvent.press(await view.findByText("Warm and grounded"));

    expect(onChange).toHaveBeenCalledWith("grounded");
    await waitFor(() => expect(onNext).toHaveBeenCalled());
  });

  it("shows no Continue button (it auto-advances)", async () => {
    const view = await renderStep({ question: single });
    await view.findByText("Gently and softly");
    expect(view.queryByText("Continue")).toBeNull();
  });
});

describe("OnboardingStep — multi select", () => {
  it("toggles values into an array", async () => {
    const onChange = jest.fn();
    const view = await renderStep({ question: multi, value: ["family"], onChange });

    await fireEvent.press(await view.findByText("Growth"));
    expect(onChange).toHaveBeenCalledWith(["family", "growth"]);

    await fireEvent.press(view.getByText("Family"));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("disables Continue until at least one is picked", async () => {
    const onNext = jest.fn();
    const view = await renderStep({ question: multi, value: [], onNext });

    await fireEvent.press(await view.findByText("Continue"));
    expect(onNext).not.toHaveBeenCalled();
  });

  it("enables Continue once something is selected", async () => {
    const onNext = jest.fn();
    const view = await renderStep({ question: multi, value: ["family"], onNext });

    await fireEvent.press(await view.findByText("Continue"));
    expect(onNext).toHaveBeenCalled();
  });
});

describe("OnboardingStep — text", () => {
  it("forwards typing", async () => {
    const onChange = jest.fn();
    const view = await renderStep({ question: text, value: "", onChange });

    await fireEvent.changeText(await view.findByLabelText(text.title), "a calmer week");
    expect(onChange).toHaveBeenCalledWith("a calmer week");
  });

  it("gates Continue on empty vs filled input", async () => {
    const emptyNext = jest.fn();
    const empty = await renderStep({ question: text, value: "", onNext: emptyNext });
    await fireEvent.press(await empty.findByText("Continue"));
    expect(emptyNext).not.toHaveBeenCalled();

    const onNext = jest.fn();
    const filled = await renderStep({ question: text, value: "a calmer week", onNext });
    await fireEvent.press(await filled.findByText("Continue"));
    expect(onNext).toHaveBeenCalled();
  });
});

describe("OnboardingStep — credential steps", () => {
  const emailQ = {
    key: "email",
    kind: "text",
    inputType: "email",
    title: "Your email",
    placeholder: "you@example.com",
  };
  const passwordQ = {
    key: "password",
    kind: "text",
    inputType: "password",
    title: "Create a password",
    placeholder: "At least 8 characters",
  };

  it("gates Continue on a valid email", async () => {
    const bad = await renderStep({ question: emailQ, value: "nope", onNext: jest.fn() });
    await fireEvent.press(await bad.findByText("Continue"));
    expect(bad).toBeTruthy();

    const onNext = jest.fn();
    const good = await renderStep({ question: emailQ, value: "ada@example.com", onNext });
    await fireEvent.press(await good.findByText("Continue"));
    expect(onNext).toHaveBeenCalled();
  });

  it("gates Continue on an 8+ character password", async () => {
    const shortNext = jest.fn();
    const short = await renderStep({ question: passwordQ, value: "short", onNext: shortNext });
    await fireEvent.press(await short.findByText("Continue"));
    expect(shortNext).not.toHaveBeenCalled();

    const onNext = jest.fn();
    const ok = await renderStep({ question: passwordQ, value: "longenough", onNext });
    await fireEvent.press(await ok.findByText("Continue"));
    expect(onNext).toHaveBeenCalled();
  });

  it("masks the password input", async () => {
    const view = await renderStep({ question: passwordQ, value: "secret123" });
    expect((await view.findByLabelText("Create a password")).props.secureTextEntry).toBe(true);
  });
});

describe("OnboardingStep — info", () => {
  const info = {
    key: "info_what",
    kind: "info",
    title: "Affirmations are short lines you say to yourself",
    subtitle: "Read a few each day.",
  };

  it("shows the message and a Continue, with no input", async () => {
    const onNext = jest.fn();
    const view = await renderStep({ question: info, onNext });

    expect(await view.findByText(info.title)).toBeTruthy();
    // No text field on an info step.
    expect(view.queryByLabelText(info.title)).toBeNull();

    await fireEvent.press(view.getByText("Continue"));
    expect(onNext).toHaveBeenCalled();
  });
});

describe("OnboardingStep — navigation affordances", () => {
  it("shows Skip only when the question is skippable", async () => {
    const view = await renderStep({ question: { ...text, skippable: true } });
    expect(await view.findByText("Skip")).toBeTruthy();
  });

  it("hides Skip on a required question", async () => {
    const view = await renderStep({ question: text });
    await view.findByLabelText(text.title);
    expect(view.queryByText("Skip")).toBeNull();
  });

  it("shows Back when not the first step", async () => {
    const view = await renderStep({ question: single, isFirst: false });
    expect(await view.findByLabelText("Back")).toBeTruthy();
  });
});
