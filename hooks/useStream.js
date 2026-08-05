import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import { NetworkError } from "../lib/errors.js";
import { useFeed } from "./useFeed.js";

const PAGE = 20;

/**
 * The immersive stream: today, then backwards through days already read.
 *
 * Backwards only, on purpose. The server schedules weeks ahead so the app works
 * offline, but letting anyone swipe into that buffer would turn a daily line
 * into a list to get through — which is precisely what the whole product is
 * arranged to avoid. Yesterday is a memory; tomorrow is tomorrow.
 *
 * Today comes from the ordinary cached feed, so the stream opens instantly and
 * works offline even before any history has loaded.
 */
export function useStream() {
  const { user, client } = useAuth();
  const { todayEntry, today } = useFeed();
  const userId = user?.id;

  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exhausted, setExhausted] = useState(false);
  const [fetching, setFetching] = useState(false);

  const loadMore = useCallback(async () => {
    if (!userId || fetching || exhausted) return;

    setFetching(true);
    try {
      const before = history.at(-1)?.date;
      const { entries } = await client.history({ days: PAGE, before });

      if (entries.length < PAGE) setExhausted(true);
      // Guard against a duplicate page if two loads race at the list's end.
      setHistory((current) => {
        const seen = new Set(current.map((e) => e.date));
        return [...current, ...entries.filter((e) => !seen.has(e.date))];
      });
    } catch (err) {
      // Offline just means the stream is as long as what we already have.
      if (err instanceof NetworkError) setExhausted(true);
      else throw err;
    } finally {
      setFetching(false);
      setLoading(false);
    }
  }, [userId, client, history, fetching, exhausted]);

  useEffect(() => {
    loadMore().catch(() => setLoading(false));
    // Only on mount: later pages are pulled by the list reaching its end.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const entries = todayEntry ? [todayEntry, ...history] : history;

  return { entries, today, loading, fetching, exhausted, loadMore };
}
