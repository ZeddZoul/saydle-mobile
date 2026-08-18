import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import ListeningSession from "../../components/ListeningSession.jsx";

// The speech boundary is mocked, never called: these are about what drives the
// session forward, not about how a device says a sentence.
jest.mock("../../lib/voice.js", () => ({
  voiceAvailable: jest.fn(() => true),
  speakLine: jest.fn(),
  stopSpeaking: jest.fn(),
}));

const voice = jest.requireMock("../../lib/voice.js");

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const LINES = Array.from({ length: 7 }, (_, i) => ({
  id: `a${i}`,
  text: `Line number ${i}.`,
}));

const renderSession = (props = {}) =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ListeningSession lines={LINES} {...props} />
    </SafeAreaProvider>,
  );

/** Runs whatever `onDone` the last speakLine call was given. */
const finishLine = async () => {
  const call = voice.speakLine.mock.calls.at(-1);
  await act(async () => {
    call?.[1]?.onDone?.();
    jest.advanceTimersByTime(4000);
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => jest.useRealTimers());

/**
 * Seven lines, read one at a time.
 *
 * The contract that matters is that the *voice* advances the session, not a
 * timer. A timer drifts out of sync with the reading on the first long line
 * and the drift compounds across seven — and it is the kind of bug that looks
 * fine in a test written against timers.
 */
describe("the listening session", () => {
  it("reads the first line without being asked", async () => {
    await renderSession();

    await waitFor(() => expect(voice.speakLine).toHaveBeenCalled());
    expect(voice.speakLine.mock.calls[0][0]).toBe("Line number 0.");
  });

  it("moves on when the voice finishes, not on a clock", async () => {
    await renderSession();
    await waitFor(() => expect(voice.speakLine).toHaveBeenCalledTimes(1));

    // Time alone must not advance it — only the voice reporting it is done.
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    expect(voice.speakLine).toHaveBeenCalledTimes(1);

    await finishLine();
    await waitFor(() => expect(voice.speakLine).toHaveBeenCalledTimes(2));
    expect(voice.speakLine.mock.calls[1][0]).toBe("Line number 1.");
  });

  it("finishes after the seventh, not before", async () => {
    const onFinish = jest.fn();
    await renderSession({ onFinish });

    for (let i = 0; i < 6; i += 1) {
      await finishLine();
      expect(onFinish).not.toHaveBeenCalled();
    }

    await finishLine();
    await waitFor(() => expect(onFinish).toHaveBeenCalled());
  });

  it("stops speaking when paused", async () => {
    const { findByTestId } = await renderSession();
    await waitFor(() => expect(voice.speakLine).toHaveBeenCalled());

    await fireEvent.press(await findByTestId("session-toggle"));

    // Pausing has to actually silence it. A paused session that keeps talking
    // is the worst version of this screen.
    await waitFor(() => expect(voice.stopSpeaking).toHaveBeenCalled());
  });

  it("silences itself on the way out", async () => {
    const { unmount } = await renderSession();
    await waitFor(() => expect(voice.speakLine).toHaveBeenCalled());

    voice.stopSpeaking.mockClear();
    // Awaited: RNTL v14's unmount is async like render and fireEvent, and
    // without it the assertion runs before React has torn anything down.
    await act(async () => {
      unmount();
    });

    // Speech outlives the screen unless something stops it — leaving would
    // otherwise carry on reading into an empty room.
    expect(voice.stopSpeaking).toHaveBeenCalled();
  });

  it("does not stall when speech is unavailable", async () => {
    // The boundary calls onDone even when it could not speak. A session that
    // only advanced on success would hang forever in exactly the case where
    // it must not.
    voice.speakLine.mockImplementation((_text, { onDone }) => {
      setTimeout(() => onDone?.(), 0);
      return { available: false };
    });

    const onFinish = jest.fn();
    await renderSession({ onFinish });

    for (let i = 0; i < 7; i += 1) {
      await act(async () => {
        jest.advanceTimersByTime(4000);
      });
    }

    await waitFor(() => expect(onFinish).toHaveBeenCalled());
  });
});
