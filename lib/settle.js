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
 * that says what is happening. SLOW runs unawaited for another ~55s, because
 * past nine seconds it is kinder to say "payment received" and keep asking
 * quietly than to hold a spinner. Both are bounded: entitlement is server-truth,
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
export const SLOW_SETTLE = [6000, 9000, 12000, 12000, 16000];

/** The fields a purchase moves. Compared before and after, never read alone. */
export const signature = (s) => `${s?.status}|${s?.expiresAt ?? ""}|${s?.verified}`;

/**
 * Re-reads until the answer is the one being waited for, or the ladder runs out.
 *
 * Returns the accepted value, or null if it never arrived. A read that throws is
 * a rung that did not answer, not a failure: the caller is waiting on a webhook,
 * and one refused request in the middle of that says nothing about the next one.
 */
export async function pollUntil(read, accept, delays) {
  for (const wait of delays) {
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));

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
