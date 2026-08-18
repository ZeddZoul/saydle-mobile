import { useMemo } from "react";
import { useLibrary } from "./useLibrary.js";

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
 */
export function usePracticeSession() {
  const library = useLibrary();

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

  return {
    lines,
    loading: library.loading,
    locked: library.locked,
    offline: library.offline,
    ready: lines.length > 0,
  };
}
