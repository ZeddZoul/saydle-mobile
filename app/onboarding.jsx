import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import GradientBackground from "../components/GradientBackground.jsx";
import DisplayText from "../components/DisplayText.jsx";
import OnboardingStep from "../components/onboarding/OnboardingStep.jsx";
import Paywall from "../components/onboarding/Paywall.jsx";
import {
  configurePurchases,
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
 * chooses a plan — or the free one — on the paywall. Nothing is persisted
 * server-side until then; abandoning the flow leaves no account, by design.
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
  // idle | loading | done — so the paywall can tell "still asking the store"
  // from "the store had nothing", and offer a retry only for the second.
  const [plans, setPlans] = useState("idle");
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

  // From the paywall, back to the last question — a wrong email is the usual
  // reason to want this, and the paywall must not be a door that only opens
  // one way.
  const backFromPaywall = () => {
    setIndex(Math.max(0, prevVisible(ONBOARDING_QUESTIONS.length)));
    setPhase("questions");
  };

  /**
   * Buys, if that is what they chose.
   *
   * Best-effort throughout, because the account already exists by this point
   * and a billing hiccup must not strand someone inside signup. A real purchase
   * is confirmed by the server via RevenueCat's webhook, never by the return
   * value here — so there is nothing to record. Anything short of a completed
   * purchase leaves them on the free plan, which the billing screen can change
   * later.
   */
  const grantAccess = async (intent, userId, chosen = null) => {
    try {
      if (intent === "subscribe" && purchasesAvailable()) {
        await configurePurchases(userId);
        const { packages } = await getOffering();

        // The one they tapped, not whichever RevenueCat happened to list
        // first. With two terms on offer, `packages[0]` was picking the plan
        // for them — and picking it arbitrarily.
        const pick = packages.find((p) => p.identifier === chosen?.identifier) ?? packages[0];

        if (pick) await purchasePackage(pick);
      }
    } catch {
      /* Non-fatal: the account exists, and the plan can be bought from Billing. */
    }
  };

  /**
   * The offering, loaded when the paywall appears and again on Retry.
   *
   * The screen has to show what each term actually costs, and the store is the
   * only authority on that — it is what localises the currency. Failing here
   * leaves the paywall with no plans and a Retry, never with nothing to tap:
   * the free plan is always there.
   */
  const loadOffering = useCallback(async () => {
    if (!purchasesAvailable()) return;
    setPlans("loading");
    try {
      const { packages: found } = await getOffering();
      setPackages(found ?? []);
    } catch {
      setPackages([]);
    } finally {
      setPlans("done");
    }
  }, []);

  useEffect(() => {
    if (phase !== "paywall") return;
    loadOffering();
  }, [phase, loadOffering]);

  const createAccount = async (intent = "free", chosen = null) => {
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
        plansLoading={plans === "loading"}
        canPurchase={purchasesAvailable()}
        onSubscribe={(pkg) => createAccount("subscribe", pkg)}
        onContinueFree={() => createAccount("free")}
        onBack={backFromPaywall}
        onRetry={loadOffering}
        // No account exists yet, so there is nothing to attach a restored
        // purchase to. Someone who already paid signs in; Billing restores.
        onRestore={() => router.replace({ pathname: "/login", params: { restore: "1" } })}
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
