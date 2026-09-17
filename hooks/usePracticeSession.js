import { useEffect, useMemo, useState } from "react";
import { useLibrary } from "./useLibrary.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import { todayLocal } from "../lib/dates.js";
import { ApiError } from "../lib/errors.js";
import { lineClipUrl } from "../lib/voices.js";

/** Seven, and fixed for the day. */
export const SESSION_SIZE = 7;

/**
 * The seven lines a listening session reads.
 *
 * Fixed rather than refreshable, and not chosen here. The intent is that
 * generation marks its seven when it writes the day's batch — the model already
 * has the reader's profile in context at that moment, so "which of these will
 * land hardest for this person" costs a few output tokens rather than a second
 * call. That field does not exist yet, so until it does this takes the first
 * seven unread, which is the same ordering the feed uses.
 *
 * Two rules it does enforce, both deliberate:
 *
 * A reader's own writing never appears. My Words belongs to Today. Practice is
 * a stranger's voice reading *to* you, and your own sentence in someone else's
 * mouth is a different and slightly uncanny thing — it is also the one text we
 * do not moderate for style, so it is the one we cannot be sure reads aloud.
 *
 * And the set is stable for the day. `useMemo` over the ids rather than the
 * array keeps it from reshuffling on every render the library hook produces,
 * which would make the session change under someone mid-listen.
 *
 * Once the seven are known it asks the server to render them, which is where
 * the ElevenLabs key lives. That request is never awaited by the UI: the
 * session opens on device speech and upgrades to real audio when the clips
 * arrive, because a reader who taps Listen should not watch a spinner while
 * seven sentences are rendered.
 *
 * The real voice is premium. A 403 from the session endpoint is the paywall
 * answering, not a failure: the session still plays, in device speech, and
 * `voiceLocked` tells the screen to say so quietly rather than with an error.
 */
export function usePracticeSession() {
  const library = useLibrary();
  const { client, user } = useAuth();
  const [clips, setClips] = useState(null);
  const [voiceLocked, setVoiceLocked] = useState(false);

  const lines = useMemo(() => {
    return (
      library.affirmations
        .filter((a) => a.source !== "custom")
        .slice()
        // `practiceRank` when the server starts marking; document order until then.
        .sort((a, b) => (a.practiceRank ?? Infinity) - (b.practiceRank ?? Infinity))
        .slice(0, SESSION_SIZE)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library.affirmations.map((a) => a.id).join(",")]);

  const ids = lines.map((a) => a.id).join(",");

  useEffect(() => {
    if (!user || lines.length === 0) return undefined;

    let cancelled = false;
    setClips(null);

    client
      .voiceSession(
        lines.map((a) => a.id),
        todayLocal(),
      )
      .then((res) => {
        if (cancelled) return;
        setVoiceLocked(false);
        // Keyed by id rather than by position: the server returns only the
        // lines it could find, so index alignment is not guaranteed.
        setClips(new Map((res.lines ?? []).map((l) => [l.id, lineClipUrl(l)])));
      })
      .catch((err) => {
        if (cancelled) return;
        // Not premium. Device speech reads the session — the same thing it
        // does offline or with no key on the server — and the screen may
        // mention what a subscription adds. Never an error toast: they did
        // nothing wrong.
        if (err instanceof ApiError && err.status === 403) setVoiceLocked(true);
        // Offline, or no key configured. Device speech reads the session,
        // which is what it did before any of this existed.
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, user?.id, client]);

  // The lines the session actually plays, each carrying its clip if one exists.
  const voiced = useMemo(
    () => lines.map((line) => ({ ...line, clipUrl: clips?.get(line.id) ?? null })),
    [lines, clips],
  );

  return {
    lines: voiced,
    loading: library.loading,
    locked: library.locked,
    offline: library.offline,
    ready: lines.length > 0,
    /** True once the server has said the real voice is premium. */
    voiceLocked,
  };
}
