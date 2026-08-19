import { fireEvent, render } from "@testing-library/react-native";
import VoicePicker from "../../components/VoicePicker.jsx";
import { VOICES } from "../../lib/voices.js";

const mockSpeak = jest.fn();
const mockStop = jest.fn();
jest.mock("../../lib/voice.js", () => ({
  speakLine: (...args) => mockSpeak(...args),
  stopSpeaking: (...args) => mockStop(...args),
}));

/**
 * The picker's whole reason to exist is that five voices differ audibly and not
 * describably. So the behaviour under test is: hearing one is separate from
 * choosing it, and a choice announces that it lands tomorrow.
 */
const renderPicker = (props = {}) =>
  render(<VoicePicker active="mother" pending={null} onChoose={jest.fn()} {...props} />);

beforeEach(() => {
  mockSpeak.mockClear();
  mockStop.mockClear();
});

describe("VoicePicker", () => {
  it("offers every archetype", async () => {
    const { findByTestId } = await renderPicker();

    for (const voice of VOICES) {
      expect(await findByTestId(`voice-choose-${voice.key}`)).toBeTruthy();
    }
  });

  it("plays a voice without choosing it", async () => {
    const onChoose = jest.fn();
    const { findByTestId } = await renderPicker({ onChoose });

    await fireEvent.press(await findByTestId("voice-preview-father"));

    // Auditioning must not commit: someone trying all five would otherwise
    // end up with whichever they happened to hear last.
    expect(onChoose).not.toHaveBeenCalled();
    expect(mockSpeak).toHaveBeenCalledTimes(1);
  });

  it("reads the sample in that voice's own parameters", async () => {
    const { findByTestId } = await renderPicker();

    await fireEvent.press(await findByTestId("voice-preview-grandmother"));

    const [text, options] = mockSpeak.mock.calls[0];
    expect(text).toBeTruthy();
    const grandmother = VOICES.find((v) => v.key === "grandmother");
    expect(options).toMatchObject(grandmother.speech);
  });

  it("stops the previous sample before starting another", async () => {
    const { findByTestId } = await renderPicker();

    await fireEvent.press(await findByTestId("voice-preview-father"));
    await fireEvent.press(await findByTestId("voice-preview-peer"));

    // Two voices talking over each other is worse than either alone.
    expect(mockStop).toHaveBeenCalledTimes(2);
  });

  it("chooses a voice when the choose control is pressed", async () => {
    const onChoose = jest.fn();
    const { findByTestId } = await renderPicker({ onChoose });

    await fireEvent.press(await findByTestId("voice-choose-mentor"));

    expect(onChoose).toHaveBeenCalledWith("mentor");
    // Choosing is not auditioning either — no sound on commit.
    expect(mockSpeak).not.toHaveBeenCalled();
  });

  it("marks the voice reading today", async () => {
    const { findByTestId, findByText } = await renderPicker({ active: "peer" });

    expect((await findByTestId("voice-choose-peer")).props.accessibilityState.selected).toBe(
      true,
    );
    expect(await findByText("Reading today")).toBeTruthy();
  });

  it("says plainly that a new choice starts tomorrow", async () => {
    const { findByText, findByTestId } = await renderPicker({
      active: "mother",
      pending: "father",
    });

    // Without this the app looks like it ignored the tap.
    expect(await findByText("From tomorrow")).toBeTruthy();
    expect((await findByTestId("voice-choose-father")).props.accessibilityState.selected).toBe(
      true,
    );
  });

  it("still shows today's voice while another is pending", async () => {
    const { findByText } = await renderPicker({ active: "mother", pending: "father" });

    // Both readable at once: what you hear now, and what you will hear next.
    expect(await findByText("Reading today")).toBeTruthy();
    expect(await findByText("From tomorrow")).toBeTruthy();
  });
});
