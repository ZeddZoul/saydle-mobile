import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useAuth } from "../contexts/AuthContext.jsx";
import { ApiError, NetworkError } from "../lib/errors.js";

const PAGE = 40;

// The cursor is sent as they scroll, not per line. Batched so a fast scroll is
// one request rather than forty, and so the server hears about progress even if
// they never reach the end of a page.
const CURSOR_DEBOUNCE_MS = 1500;

/**
 * The scrollable library: a long batch written for this reader, in order.
 *
 * "New to them" is a position, not a per-line record — the server keeps one
 * integer and this hook pushes it forward. Scrolling back up never moves it
 * back, because being shown a line again is not the same as not having seen it.
 *
 * Premium. A 403 is the paywall answering, not a failure: `locked` is a state
 * the screen renders, not an error it reports.
 */
export function useLibrary() {
  const { user, client } = useAuth();
  const userId = user?.id;

  const [affirmations, setAffirmations] = useState([]);
  const [cursor, setCursor] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [offline, setOffline] = useState(false);
  const [refilling, setRefilling] = useState(false);
  const [fetching, setFetching] = useState(false);

  // Where they have actually scrolled to, versus what the server has been told.
  const reached = useRef(0);
  const pushed = useRef(0);
  const timer = useRef(null);

  const load = useCallback(
    async ({ append = false } = {}) => {
      if (!userId) return;

      setFetching(true);
      try {
        const at = append ? cursor + affirmations.length : undefined;
        const page = await client.library({ cursor: at, limit: PAGE });

        setLocked(false);
        setOffline(false);
        setRemaining(page.remaining);
        setRefilling(page.refilling);
        if (!append) setCursor(page.cursor);

        setAffirmations((current) => {
          if (!append) return page.affirmations;
          // Two loads racing at the end of the list must not double a page.
          const seen = new Set(current.map((a) => a.id));
          return [...current, ...page.affirmations.filter((a) => !seen.has(a.id))];
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 403) setLocked(true);
        else if (err instanceof NetworkError) setOffline(true);
        else throw err;
      } finally {
        setFetching(false);
        setLoading(false);
      }
    },
    [userId, client, cursor, affirmations.length],
  );

  useEffect(() => {
    load().catch(() => setLoading(false));
    // Mount only; later pages come from the list reaching its end.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  /**
   * Try again when the app comes back, if the first attempt never landed.
   *
   * Mount was the only trigger. One failed load — a request made a second
   * before the network settled, say — left the feed empty and offline with
   * nothing to retry it: the screen's focus effect only fires on a *change* of
   * focus, and Today is focused already. The feed sat on "being prepared"
   * indefinitely while every other request in the app succeeded. Seen exactly
   * that way on device.
   *
   * Only when there is nothing to show. Someone reading page forty must not be
   * yanked back to the top because they took a call.
   */
  useEffect(() => {
    if (!userId) return;

    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      if (offline || affirmations.length === 0) load().catch(() => {});
    });

    return () => sub.remove();
  }, [userId, offline, affirmations.length, load]);

  /**
   * Tell the server how far they got.
   *
   * Debounced and monotonic. A failure here is deliberately silent: the worst
   * case is being shown a line twice, which is a far smaller cost than an error
   * toast in the middle of something someone is reading.
   */
  const markReached = useCallback(
    (index) => {
      const absolute = cursor + index + 1;
      if (absolute <= reached.current) return;
      reached.current = absolute;

      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        if (reached.current <= pushed.current) return;
        const send = reached.current;

        client
          .librarySeen(send)
          .then(() => {
            pushed.current = send;
          })
          .catch(() => {});
      }, CURSOR_DEBOUNCE_MS);
    },
    [client, cursor],
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  const loadMore = useCallback(() => {
    if (fetching || affirmations.length >= remaining) return;
    load({ append: true }).catch(() => {});
  }, [fetching, affirmations.length, remaining, load]);

  return {
    affirmations,
    loading,
    fetching,
    locked,
    offline,
    refilling,
    remaining,
    loadMore,
    markReached,
    refresh: () => load(),
  };
}
