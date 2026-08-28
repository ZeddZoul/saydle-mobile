import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";

/**
 * expo-audio, or a set of stubs shaped like it.
 *
 * This has to be a lazy require in a try/catch like every other native
 * boundary — a top-level `import` of a module that is not in the binary throws
 * at import time and takes the whole Practice screen down, which is exactly
 * what it did. The stack said `useVoiceNote.js (2:1)`, an import line, and no
 * amount of guarding further down would have helped.
 *
 * The awkward part is that three of these are React hooks, so they cannot be
 * required inside the component. Resolving the module once at module scope and
 * substituting inert hooks keeps the call order identical on every render,
 * which is what the rules of hooks actually require — the module either exists
 * for the life of the process or it does not, so the choice never changes.
 */
const Audio = (() => {
  try {
    return require("expo-audio");
  } catch {
    return null;
  }
})();

const RecordingPresets = Audio?.RecordingPresets ?? { HIGH_QUALITY: {} };
const requestRecordingPermissionsAsync =
  Audio?.requestRecordingPermissionsAsync ?? (async () => ({ granted: false }));
const setAudioModeAsync = Audio?.setAudioModeAsync ?? (async () => {});
const useAudioPlayer =
  Audio?.useAudioPlayer ?? (() => ({ play() {}, seekTo() {}, remove() {} }));
const useAudioRecorder =
  Audio?.useAudioRecorder ??
  (() => ({
    prepareToRecordAsync: async () => {},
    record() {},
    stop: async () => {},
    uri: null,
  }));
const useAudioRecorderState = Audio?.useAudioRecorderState ?? (() => ({ isRecording: false }));

/** False on a build without the native module — the UI hides recording. */
export const voiceNotesAvailable = () => Boolean(Audio?.useAudioRecorder);

/**
 * One recording per affirmation, in your own voice, kept on this device.
 *
 * This is the part a widget can't do. Reading a line is someone else's
 * sentence; hearing yourself say it is yours, and played back it lands
 * differently from the same words on a screen.
 *
 * Nothing is uploaded. The audio file stays where the recorder wrote it and we
 * persist only its URI — a server copy of someone talking to themselves is a
 * liability with no upside. It also means a reinstall loses the recordings,
 * which is the right trade for something this private.
 */
export function useVoiceNote(affirmationId) {
  const { user, cache } = useAuth();
  const userId = user?.id;

  const [notes, setNotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  // Intent, held ourselves. `useAudioRecorderState` polls, so for a beat after
  // `start()` it still reports not-recording — and a second tap in that beat
  // read as "start another take". Flipping this synchronously shrinks the race
  // from a poll interval to one React commit, which no human tap fits inside.
  const [taking, setTaking] = useState(false);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const note = affirmationId ? notes[affirmationId] : null;
  const player = useAudioPlayer(note?.uri ?? null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    cache.loadVoiceNotes(userId).then((saved) => {
      if (cancelled) return;
      setNotes(saved ?? {});
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, cache]);

  const persist = useCallback(
    async (next) => {
      setNotes(next);
      if (userId) await cache.saveVoiceNotes(userId, next);
    },
    [userId, cache],
  );

  const start = useCallback(async () => {
    setTaking(true);
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setDenied(true);
      setTaking(false);
      return false;
    }
    setDenied(false);

    // Recording on iOS needs the session switched over, and playing back
    // through the earpiece instead of the speaker would make the playback
    // sound broken rather than quiet.
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    return true;
  }, [recorder]);

  const stop = useCallback(async () => {
    setTaking(false);
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });

    const uri = recorder.uri;
    if (!uri || !affirmationId) return null;

    await persist({
      ...notes,
      [affirmationId]: { uri, recordedAt: new Date().toISOString() },
    });
    return uri;
  }, [recorder, affirmationId, notes, persist]);

  const play = useCallback(() => {
    if (!note?.uri) return;
    player.seekTo(0);
    player.play();
  }, [note, player]);

  const discard = useCallback(async () => {
    if (!affirmationId || !notes[affirmationId]) return;
    const next = { ...notes };
    delete next[affirmationId];
    await persist(next);
  }, [affirmationId, notes, persist]);

  return {
    loading,
    denied,
    recording: taking || state.isRecording,
    /** Milliseconds into the current take, for a live counter. */
    elapsed: state.durationMillis ?? 0,
    hasNote: Boolean(note?.uri),
    recordedAt: note?.recordedAt ?? null,
    start,
    stop,
    play,
    discard,
  };
}
