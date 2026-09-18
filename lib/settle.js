/**
 * How long to keep asking the server after a purchase.
 *
 * A sale is confirmed by the store, relayed to RevenueCat, and only then posted
 * to our webhook — so the read taken the instant `purchasePackage` resolves is
 * genuinely too early. Measured against a real Test Store purchase, the webhook
 * took **80 seconds** to arrive, so the window has to be far wider than felt
 * reasonable a priori.
 *
 * FAST is the phase somebody waits through: ~9s, buttons disabled, a spinner
 * that says what is happening. SLOW runs for another ~75s, because
 * past nine seconds it is kinder to say "payment received" and keep asking
 * quietly than to hold a spinner. The last read lands at ~84s, deliberately
 * past the 80 that was measured rather than short of it — the ladder used to
 * stop at 63.8s, which is a poll that gives up before the event it is waiting
 * for typically arrives. Both are bounded: entitlement is server-truth,
 * so a webhook that never comes is still corrected on the next foreground,
 * whereas polling forever would turn an outage into a request loop from every
 * install.
 *
 * Shared rather than duplicated. These numbers were tuned against one real
 * measurement, and a second copy that drifted would be a purchase flow that
 * gives up earlier than the one it was copied from — which looks exactly like
 * a payment that did not go through.
 */
export const FAST_SETTLE = [0, 800, 1500, 2500, 4000];
export const SLOW_SETTLE = [6000, 9000, 12000, 12000, 16000, 20000];

/** The fields a purchase moves. Compared before and after, never read alone. */
export const signature = (s) => `${s?.status}|${s?.expiresAt ?? ""}|${s?.verified}`;

/**
 * Sleeps, unless asked to stop first.
 *
 * Resolves true if the wait completed, false if it was cut short. A bare
 * `setTimeout` cannot be called off, so a poll on the slow ladder would keep a
 * sixteen-second timer alive well past the screen that started it.
 */
const sleep = (ms, signal) =>
  new Promise((resolve) => {
    const finish = (completed) => {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", onAbort);
      resolve(completed);
    };

    const onAbort = () => finish(false);
    const timer = setTimeout(() => finish(true), ms);

    if (signal?.aborted) onAbort();
    else signal?.addEventListener?.("abort", onAbort, { once: true });
  });

/**
 * Re-reads until the answer is the one being waited for, or the ladder runs out.
 *
 * Returns the accepted value, or null if it never arrived. A read that throws is
 * a rung that did not answer, not a failure: the caller is waiting on a webhook,
 * and one refused request in the middle of that says nothing about the next one.
 *
 * `signal` stops it. Without one the slow ladder outlives the screen that
 * started it by the best part of a minute, still asking the API on behalf of
 * someone who has navigated away — and answering into a component that is gone.
 */
export async function pollUntil(read, accept, delays, { signal } = {}) {
  for (const wait of delays) {
    if (signal?.aborted) return null;
    if (wait && !(await sleep(wait, signal))) return null;
    if (signal?.aborted) return null;

    let value = null;
    try {
      value = await read();
    } catch {
      continue;
    }

    if (value && accept(value)) return value;
  }

  return null;
}
