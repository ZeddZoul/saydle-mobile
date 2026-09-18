import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import GradientBackground from "../components/GradientBackground.jsx";
import DisplayText from "../components/DisplayText.jsx";
import OnboardingStep from "../components/onboarding/OnboardingStep.jsx";
import Paywall from "../components/onboarding/Paywall.jsx";
import {
  ensureConfigured,
  identifyUser,
  getOffering,
  purchasePackage,
  purchasesAvailable,
} from "../lib/purchases.js";
import { ONBOARDING_QUESTIONS } from "../lib/onboardingQuestions.js";
import { buildSignupPayload } from "../lib/onboardingSubmit.js";
import { requestPermission } from "../lib/notifications.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useToast } from "../contexts/ToastContext.jsx";
import { ApiError, messageFor } from "../lib/errors.js";
import { colors, spacing } from "../theme/tokens.js";
import { useT } from "../lib/i18n.js";

const EMAIL_INDEX = ONBOARDING_QUESTIONS.findIndex((q) => q.key === "email");

/**
 * The whole sign-up flow: the account fields (email, password) are steps like
 * any other, and the account is only created at the very end, once the user
 * chooses a plan on the paywall. Nothing is persisted server-side until then —
 * abandoning the flow leaves no account, by design.
 *
 * Never shows how many pages remain ("keep the mystery").
 */
const Onboarding = () => {
  const { t } = useT();
  const router = useRouter();
  const { signUp, updatePreferences, client } = useAuth();
  const toast = useToast();

  // questions | paywall | creating
  const [phase, setPhase] = useState("questions");
  const [packages, setPackages] = useState([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  // Mirror of answers, updated synchronously — a single-select advances on a
  // timer, so the advance closure would otherwise read stale answers and mis-
  // evaluate a showIf (e.g. the beliefs question that depends on `religion`).
  const answersRef = useRef({});

  const question = ONBOARDING_QUESTIONS[index];

  const setAnswer = (value) =>
    setAnswers((prev) => {
      const next = { ...prev, [question.key]: value };
      answersRef.current = next;
      return next;
    });

  const isVisible = (q) => !q.showIf || q.showIf(answersRef.current);
  const nextVisible = (from) => {
    let i = from + 1;
    while (i < ONBOARDING_QUESTIONS.length && !isVisible(ONBOARDING_QUESTIONS[i])) i += 1;
    return i;
  };
  const prevVisible = (from) => {
    let i = from - 1;
    while (i > 0 && !isVisible(ONBOARDING_QUESTIONS[i])) i -= 1;
    return i;
  };

  const advance = () => {
    const next = nextVisible(index);
    if (next >= ONBOARDING_QUESTIONS.length) setPhase("paywall");
    else setIndex(next);
  };
  const back = () => setIndex((i) => Math.max(0, prevVisible(i)));

  /**
   * Attempts the purchase at the end of the flow.
   *
   * Best-effort on purpose: the account already exists by this point, so a
   * billing hiccup must not strand someone inside signup. They land in the app
   * unentitled and meet the paywall again, which is the correct outcome for a
   * hard paywall - there is nothing to grant on failure.
   */
  const grantAccess = async (intent, userId, chosen = null) => {
    try {
      if (intent === "subscribe" && purchasesAvailable()) {
        // The account exists by now, so name it to RevenueCat before buying.
        // This aliases the anonymous customer the paywall configured onto the
        // real one, which is what makes the webhook's app_user_id resolvable.
        //
        // The result is checked, and that is load-bearing. `logIn` is a backend
        // round-trip, unlike `configure`, which assigns identity locally and
        // cannot fail on a network. When it rejects the SDK stays the anonymous
        // customer, and buying then charges the card and posts an event whose
        // app_user_id is `$RCAnonymousID:…` — which `User.findById` cannot
        // resolve, so the webhook answers 204 and the purchase grants nothing,
        // silently. Better unsold than charged and unentitled: the account
        // exists, so Profile offers the same purchase once RevenueCat answers.
        const identity = await identifyUser(userId);
        if (!identity.available) return;

        const { packages } = await getOffering();

        // The one they tapped, not whichever RevenueCat happened to list
        // first. With two terms on offer, `packages[0]` was picking the plan
        // for them — and picking it arbitrarily.
        const pick = packages.find((p) => p.identifier === chosen?.identifier) ?? packages[0];

        if (pick) {
          const result = await purchasePackage(pick);
          // A real purchase is confirmed by the server via RevenueCat's
          // webhook, never by this return value — so there is nothing to record
          // here.
          if (result.purchased) return;
        }
      }
    } catch {
      /* Non-fatal: the account exists, and they can subscribe from Profile. */
    }
  };

  /**
   * The offering, loaded when the paywall appears.
   *
   * The screen has to show what each term actually costs, and the store is the
   * only authority on that — it is what localises the currency. Failing here is
   * silent: the paywall simply shows no prices, which is the state it was in
   * before it showed any.
   */
  useEffect(() => {
    if (phase !== "paywall" || !purchasesAvailable()) return;

    let cancelled = false;
    // Configure first. getOfferings() on an unconfigured SDK throws, which the
    // boundary turns into an empty package list, which hides every purchase
    // button - and the only other thing that configures is behind those
    // buttons. Nobody could subscribe and nothing logged an error.
    ensureConfigured()
      .then(() => getOffering())
      .then(({ packages: found }) => {
        if (!cancelled) setPackages(found ?? []);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [phase]);

  const createAccount = async (intent, chosen = null) => {
    setPhase("creating");
    const { account, preferences, profile, reminderWindow } = buildSignupPayload(answers);

    try {
      const created = await signUp(account);

      // They said when they'd like a lift, so ask the OS now — right after the
      // answer that explains why we're asking. `enabled` records what was
      // actually granted, so settings never claim reminders that can't fire.
      if (reminderWindow) {
        const granted = await requestPermission();
        preferences.reminders = { enabled: granted, ...reminderWindow };
      }

      // Apply personalization before navigating, so the first feed is already
      // shaped by the answers. Both are best-effort: the account exists either
      // way, and preferences/profile can be edited later.
      if (Object.keys(preferences).length > 0) {
        try {
          await updatePreferences(preferences);
        } catch {
          /* non-fatal */
        }
      }
      if (Object.keys(profile).length > 0) {
        try {
          await client.updateProfile(profile);
        } catch {
          /* non-fatal */
        }
      }

      await grantAccess(intent, created?.id, chosen);

      router.replace("/dashboard");
    } catch (err) {
      // The one bad end-of-flow surprise: email already taken. Drop them back on
      // the email step rather than stranding them on the paywall.
      if (err instanceof ApiError && err.status === 409) {
        toast.error(t("errors.emailTaken"));
        setIndex(EMAIL_INDEX);
        setPhase("questions");
      } else {
        toast.error(messageFor(err));
        setPhase("paywall");
      }
    }
  };

  if (phase === "creating") {
    return (
      <GradientBackground style={styles.center}>
        <ActivityIndicator size="large" color={colors.coral} />
        <DisplayText weight="italic" style={styles.finishText}>
          {t("paywall.creating")}
        </DisplayText>
      </GradientBackground>
    );
  }

  if (phase === "paywall") {
    return (
      <Paywall
        packages={packages}
        onSubscribe={(pkg) => createAccount("subscribe", pkg)}
        canPurchase={purchasesAvailable()}
      />
    );
  }

  return (
    <OnboardingStep
      key={question.key}
      question={question}
      value={answers[question.key]}
      onChange={setAnswer}
      onNext={advance}
      onBack={back}
      onSkip={advance}
      isFirst={index === 0}
    />
  );
};

export default Onboarding;

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xl,
    paddingHorizontal: spacing.xxl,
  },
  finishText: {
    fontSize: 20,
    lineHeight: 28,
    color: colors.mauveDeep,
    textAlign: "center",
  },
});
