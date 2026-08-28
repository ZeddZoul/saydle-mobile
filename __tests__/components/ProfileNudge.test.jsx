import { render, fireEvent, waitFor } from "@testing-library/react-native";
import ProfileNudge from "../../components/ProfileNudge.jsx";
import { NetworkError } from "../../lib/errors.js";

const single = {
  key: "innerCritic",
  kind: "single",
  label: "Inner voice",
  options: ["harsh", "kind"],
};
const multi = { key: "values", kind: "multi", label: "Values", options: ["growth", "peace"] };
const text = { key: "aspiration", kind: "text", label: "Who you're becoming" };

describe("ProfileNudge", () => {
  it("renders nothing when there is no question to ask", async () => {
    const { queryByTestId } = await render(
      <ProfileNudge suggestion={null} onAnswer={jest.fn()} />,
    );
    expect(queryByTestId("profile-nudge")).toBeNull();
  });

  it("asks the question in the words onboarding used, not the raw field label", async () => {
    const { findByText, queryByText } = await render(
      <ProfileNudge suggestion={single} onAnswer={jest.fn()} />,
    );

    await findByText("When something goes wrong, what's the voice in your head like?");
    expect(await findByText("Harsh and critical")).toBeTruthy();
    expect(queryByText("Inner voice")).toBeNull();
  });

  it("falls back to readable labels for a field the funnel never asked", async () => {
    const unknown = {
      key: "improveAreas",
      kind: "multi",
      label: "What you want to improve",
      options: ["positive-thinking"],
    };
    const { findByText } = await render(
      <ProfileNudge suggestion={unknown} onAnswer={jest.fn()} />,
    );

    expect(await findByText("Positive thinking")).toBeTruthy();
  });

  it("saves a single-select on tap — no extra button to press", async () => {
    const onAnswer = jest.fn(async () => {});
    const { findByText, queryByText } = await render(
      <ProfileNudge suggestion={single} onAnswer={onAnswer} />,
    );

    expect(queryByText("Save")).toBeNull();
    await fireEvent.press(await findByText("Harsh and critical"));

    expect(onAnswer).toHaveBeenCalledWith("innerCritic", "harsh");
  });

  it("collects several answers before saving a multi-select", async () => {
    const onAnswer = jest.fn(async () => {});
    const { findByText } = await render(
      <ProfileNudge suggestion={multi} onAnswer={onAnswer} />,
    );

    await fireEvent.press(await findByText("Growth"));
    await fireEvent.press(await findByText("Peace"));
    await fireEvent.press(await findByText("Save"));

    expect(onAnswer).toHaveBeenCalledWith("values", ["growth", "peace"]);
  });

  it("will not save an empty answer", async () => {
    const onAnswer = jest.fn(async () => {});
    const { findByText } = await render(<ProfileNudge suggestion={text} onAnswer={onAnswer} />);

    await fireEvent.press(await findByText("Save"));
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("trims free text before sending it", async () => {
    const onAnswer = jest.fn(async () => {});
    const { findByText, findByLabelText } = await render(
      <ProfileNudge suggestion={text} onAnswer={onAnswer} />,
    );

    const input = await findByLabelText(
      "When you picture the person you're becoming, what's different?",
    );
    await fireEvent.changeText(input, "  someone who rests  ");
    await fireEvent.press(await findByText("Save"));

    expect(onAnswer).toHaveBeenCalledWith("aspiration", "someone who rests");
  });

  it("thanks them once the answer lands, instead of asking again", async () => {
    const { findByText, findByTestId, queryByTestId } = await render(
      <ProfileNudge suggestion={single} onAnswer={jest.fn(async () => {})} />,
    );

    await fireEvent.press(await findByText("Harsh and critical"));

    await findByTestId("nudge-thanks");
    expect(queryByTestId("profile-nudge")).toBeNull();
  });

  it("says the answer did not land when saving fails", async () => {
    const onAnswer = jest.fn(async () => {
      throw new NetworkError(new Error("offline"));
    });
    const { findByText, findByRole, queryByTestId } = await render(
      <ProfileNudge suggestion={single} onAnswer={onAnswer} />,
    );

    await fireEvent.press(await findByText("Harsh and critical"));

    await findByRole("alert");
    // Still asking — we never pretend an answer saved.
    await waitFor(() => expect(queryByTestId("profile-nudge")).toBeTruthy());
  });

  it("offers no way out when it was not the one interrupting", async () => {
    const withDismiss = await render(
      <ProfileNudge suggestion={single} onAnswer={jest.fn()} onDismiss={jest.fn()} />,
    );
    expect(await withDismiss.findByText("Not now")).toBeTruthy();

    const sought = await render(<ProfileNudge suggestion={multi} onAnswer={jest.fn()} />);
    expect(sought.queryByText("Not now")).toBeNull();
  });

  it("passes the dismissal up so the cadence can back off", async () => {
    const onDismiss = jest.fn();
    const { findByText } = await render(
      <ProfileNudge suggestion={single} onAnswer={jest.fn()} onDismiss={onDismiss} />,
    );

    await fireEvent.press(await findByText("Not now"));
    expect(onDismiss).toHaveBeenCalled();
  });

  it("clears a part-typed answer when a different question arrives", async () => {
    const onAnswer = jest.fn(async () => {});
    const { rerender, findByText, findByLabelText } = await render(
      <ProfileNudge suggestion={text} onAnswer={onAnswer} />,
    );

    await fireEvent.changeText(
      await findByLabelText("When you picture the person you're becoming, what's different?"),
      "half an answer",
    );

    await rerender(
      <ProfileNudge
        suggestion={{ key: "limitingBelief", kind: "text", label: "Belief" }}
        onAnswer={onAnswer}
      />,
    );

    // The old text must not be submitted against the new question.
    await fireEvent.press(await findByText("Save"));
    expect(onAnswer).not.toHaveBeenCalled();
  });
});
