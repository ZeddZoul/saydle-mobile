import { render, fireEvent } from "@testing-library/react-native";
import Practice from "../../app/(dashboard)/practice.jsx";
import { AuthProvider } from "../../contexts/AuthContext.jsx";
import { todayLocal } from "../../lib/dates.js";

jest.mock("expo-router", () => ({
  useFocusEffect: (cb) => require("react").useEffect(cb, [cb]),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}));

/**
 * The voice control, split.
 *
 * One pill used to record, stop AND play, branching on a recorder state that
 * polls — so the tap meant to play back landed before the state caught up and
 * started another take. These pin the split: record never plays, play never
 * records, and play simply is not there until a take exists.
 */
const mockVoice = {
  loading: false,
  denied: false,
  recording: false,
  elapsed: 0,
  hasNote: false,
  recordedAt: null,
  start: jest.fn(async () => true),
  stop: jest.fn(async () => "file:///tmp/take.m4a"),
  play: jest.fn(),
  discard: jest.fn(async () => {}),
};

jest.mock("../../hooks/useVoiceNote.js", () => ({
  useVoiceNote: () => mockVoice,
}));

const USER = { id: "u1", firstName: "Ada", email: "ada@example.com" };
// Dated with the app's own helper, not a literal: a hardcoded date made this
// suite pass until midnight and fail after, since todayEntry matches on today.
const ENTRY = {
  date: todayLocal(),
  affirmation: { id: "a1", text: "I can rest without earning it." },
};

const makeStore = () => ({
  hasSession: jest.fn(async () => true),
  getAccessToken: jest.fn(async () => "a1"),
  getRefreshToken: jest.fn(async () => "r1"),
  setSession: jest.fn(async () => {}),
  clear: jest.fn(async () => {}),
});

const makeCache = () => ({
  loadUser: jest.fn(async () => USER),
  saveUser: jest.fn(async () => {}),
  loadFeed: jest.fn(async () => ({ today: ENTRY.date, entries: [ENTRY] })),
  saveFeed: jest.fn(async () => {}),
  loadFavorites: jest.fn(async () => []),
  saveFavorites: jest.fn(async () => {}),
  loadOutbox: jest.fn(async () => []),
  saveOutbox: jest.fn(async () => {}),
  loadPractice: jest.fn(async () => null),
  savePractice: jest.fn(async () => {}),
  loadVoiceNotes: jest.fn(async () => ({})),
  saveVoiceNotes: jest.fn(async () => {}),
  clear: jest.fn(async () => {}),
});

const makeClient = () => ({
  me: jest.fn(async () => ({ user: USER })),
  feed: jest.fn(async () => ({ today: ENTRY.date, entries: [ENTRY] })),
  today: jest.fn(async () => ({ today: ENTRY.date, entry: ENTRY })),
  favorites: jest.fn(async () => ({ favorites: [] })),
  customAffirmations: jest.fn(async () => ({ affirmations: [] })),
  streak: jest.fn(async () => ({ current: 0, practicedOn: [] })),
});

const renderPractice = () =>
  render(
    <AuthProvider store={makeStore()} cache={makeCache()} client={makeClient()}>
      <Practice />
    </AuthProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockVoice.recording = false;
  mockVoice.hasNote = false;
});

describe("the voice controls", () => {
  it("hides play until a take exists", async () => {
    const { findByTestId, queryByTestId } = await renderPractice();

    await findByTestId("practice-voice");
    expect(queryByTestId("practice-voice-play")).toBeNull();
  });

  it("record records; it never plays", async () => {
    mockVoice.hasNote = true;
    const { findByTestId } = await renderPractice();

    await fireEvent.press(await findByTestId("practice-voice"));

    expect(mockVoice.start).toHaveBeenCalled();
    expect(mockVoice.play).not.toHaveBeenCalled();
  });

  it("play plays; it never starts a take", async () => {
    mockVoice.hasNote = true;
    const { findByTestId } = await renderPractice();

    await fireEvent.press(await findByTestId("practice-voice-play"));

    expect(mockVoice.play).toHaveBeenCalled();
    expect(mockVoice.start).not.toHaveBeenCalled();
  });

  it("a tap mid-take stops it rather than stacking a second one", async () => {
    mockVoice.recording = true;
    const { findByTestId } = await renderPractice();

    await fireEvent.press(await findByTestId("practice-voice"));

    expect(mockVoice.stop).toHaveBeenCalled();
    expect(mockVoice.start).not.toHaveBeenCalled();
  });
});
