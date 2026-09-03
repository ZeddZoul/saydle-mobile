import { fireEvent, render } from "@testing-library/react-native";
import VoicePicker from "../../components/VoicePicker.jsx";
import { VOICES } from "../../lib/voices.js";

const mockPlay = jest.fn();
const mockStop = jest.fn();
jest.mock("../../lib/voice.js", () => ({
  playClip: (...args) => mockPlay(...args),
  speakLine: jest.fn(),
  stopSpeaking: (...args) => mockStop(...args),
}));

const mockPreview = jest.fn(async (key) => ({ voice: key, clipId: `clip-${key}` }));
jest.mock("../../contexts/AuthContext.jsx", () => ({
  useAuth: () => ({ client: { voicePreview: (...a) => mockPreview(...a) } }),
}));

/**
 * The picker's whole reason to exist is that five voices differ audibly and not
 * describably. So the behaviour under test is: hearing one is separate from
 * choosing it, and a choice announces that it lands tomorrow.
 */
const renderPicker = (props = {}) =>
  render(<VoicePicker active="mother" pending={null} onChoose={jest.fn()} {...props} />);

beforeEach(() => {
  mockPlay.mockClear();
  mockStop.mockClear();
  mockPreview.mockClear();
  mockPreview.mockImplementation(async (key) => ({ voice: key, clipId: `clip-${key}` }));
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
    expect(mockPlay).toHaveBeenCalledTimes(1);
  });

  it("plays the real voice, not the device reading the sample", async () => {
    const { findByTestId } = await renderPicker();

    await fireEvent.press(await findByTestId("voice-preview-grandfather"));

    // Five archetypes previewed in device speech is the same voice five times
    // with the pitch nudged — worse than no preview, because it misrepresents
    // exactly the thing being chosen.
    expect(mockPreview).toHaveBeenCalledWith("grandfather");
    expect(mockPlay.mock.calls[0][0]).toContain("clip-grandfather");
  });

  it("carries the device parameters as the fallback", async () => {
    mockPreview.mockRejectedValue(new Error("offline"));
    const { findByTestId } = await renderPicker();

    await fireEvent.press(await findByTestId("voice-preview-grandfather"));

    const [url, options] = mockPlay.mock.calls[0];
    const grandfather = VOICES.find((v) => v.key === "grandfather");
    // No clip to play, so playClip reads the sample with the device instead —
    // which at least confirms the control does something.
    expect(url).toBeNull();
    expect(options).toMatchObject(grandfather.speech);
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
    expect(mockPlay).not.toHaveBeenCalled();
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

  /**
   * The free plan: hear every voice, choose none.
   *
   * Previews are shared and cost nothing, so auditioning stays open — hearing
   * what a subscription buys is the whole pitch. The choose control becomes a
   * "Premium" tag that opens Billing, because a radio the server would refuse
   * is a tap that visibly does nothing.
   */
  describe("when choosing is premium", () => {
    it("still lets every voice be heard", async () => {
      const { findByTestId } = await renderPicker({ locked: true });

      await fireEvent.press(await findByTestId("voice-preview-father"));

      expect(mockPlay).toHaveBeenCalledTimes(1);
    });

    it("replaces the choose control with a Premium tag", async () => {
      const { findAllByText, queryByTestId } = await renderPicker({ locked: true });

      expect((await findAllByText("Premium")).length).toBe(VOICES.length);
      expect(queryByTestId("voice-choose-mentor")).toBeNull();
    });

    it("sends the tag to Billing rather than choosing", async () => {
      const onChoose = jest.fn();
      const onUpgrade = jest.fn();
      const { findByTestId } = await renderPicker({ locked: true, onChoose, onUpgrade });

      await fireEvent.press(await findByTestId("voice-premium-mentor"));

      expect(onUpgrade).toHaveBeenCalledTimes(1);
      expect(onChoose).not.toHaveBeenCalled();
    });
  });
});
