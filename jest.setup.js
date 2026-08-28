// Tell React it's running under a test runner that manages act() batching.
// Without this, every state update from an async effect warns and renderHook's
// result comes back undefined.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// SecureStore has no JS-only implementation — it bridges to the Keychain, so it
// must be mocked for every test that touches the auth graph.
jest.mock("expo-secure-store", () => {
  const store = new Map();
  return {
    getItemAsync: jest.fn(async (key) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key, value) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key) => {
      store.delete(key);
    }),
    __store: store,
  };
});

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// Native-only modules the redesign added. Test the code around them, not the
// native side — impact/selection feedback is a no-op, the gradient is a plain
// view, and Fraunces resolves as "loaded" so screens render in tests.
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(async () => {}),
  selectionAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
}));

jest.mock("expo-linear-gradient", () => {
  const { View } = require("react-native");
  return { LinearGradient: View };
});

// Recording and playback are native all the way down, so the boundary is mocked
// and the logic worth testing — which note belongs to which affirmation, and
// what is persisted — lives in hooks/useVoiceNote.js above it.
jest.mock("expo-audio", () => ({
  RecordingPresets: { HIGH_QUALITY: {} },
  requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
  setAudioModeAsync: jest.fn(async () => {}),
  useAudioRecorder: () => ({
    record: jest.fn(),
    stop: jest.fn(async () => {}),
    prepareToRecordAsync: jest.fn(async () => {}),
    uri: "file:///tmp/recording.m4a",
  }),
  useAudioRecorderState: () => ({ isRecording: false, durationMillis: 0 }),
  useAudioPlayer: () => ({
    play: jest.fn(),
    pause: jest.fn(),
    seekTo: jest.fn(),
    remove: jest.fn(),
  }),
  useAudioPlayerStatus: () => ({ playing: false }),
}));

// Local notifications bridge to the OS scheduler, so the boundary is mocked and
// the schedulable logic is tested directly in lib/reminders.js.
jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => {}),
  getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  scheduleNotificationAsync: jest.fn(async () => "notification-id"),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => {}),
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DATE: "date" },
}));

jest.mock("@expo-google-fonts/fraunces", () => ({
  useFonts: () => [true, null],
  Fraunces_400Regular: "Fraunces_400Regular",
  Fraunces_500Medium: "Fraunces_500Medium",
  Fraunces_600SemiBold: "Fraunces_600SemiBold",
  Fraunces_600SemiBold_Italic: "Fraunces_600SemiBold_Italic",
  Fraunces_700Bold: "Fraunces_700Bold",
}));
