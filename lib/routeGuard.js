/**
 * Where a given session belongs, as a pure function.
 *
 * Extracted from the layout so it can be tested exhaustively. The guard it
 * replaced was the only part of the app with no test at all, which is how the
 * paywall shipped unable to sell anything: a screen that silently offers
 * nothing looks identical to a screen with nothing to offer, and no test could
 * tell them apart because no test existed.
 *
 * Returns the path to redirect to, or null to stay put.
 */

/**
 * The only screen a signed-in but unpaid account may reach.
 *
 * One route rather than several, because everything such an account legitimately
 * needs is on it: the offer, restore, the terms, sign out, delete account, and a
 * way to reach support. Account deletion must be available inside the app (App
 * Store guideline 5.1.1(v)) and the privacy policy promises it, so it cannot sit
 * behind the paywall — putting it on this page is what lets the gate close
 * around everything else, Profile and Billing included.
 */
export const UNPAID_ROUTES = new Set(["locked"]);

export function nextRoute({ isSignedIn, entitled, segments = [] }) {
  const group = segments[0];
  const screen = segments[1];
  const inDashboard = group === "(dashboard)";

  if (!isSignedIn) {
    // The onboarding flow IS the sign-up — the account is not created until its
    // end — so a signed-out reader is allowed to be in it. Only the app is
    // gated.
    return inDashboard ? "/login" : null;
  }

  // Onboarding creates the account and then attempts the purchase, and it
  // navigates itself once both are done. The account exists, and is not yet
  // entitled, from the moment signUp returns — redirecting on that would tear
  // the screen out from under the purchase the flow exists to make.
  if (group === "onboarding") return null;

  // The paywall is hard. One screen until they pay, and it is not the app.
  if (!entitled) {
    return !inDashboard || !UNPAID_ROUTES.has(screen) ? "/locked" : null;
  }

  return inDashboard ? null : "/dashboard";
}
