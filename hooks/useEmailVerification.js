import { useCallback, useState } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import { NetworkError } from "../lib/errors.js";

/**
 * Confirming the account's email address.
 *
 * Deliberately not a gate. Nothing in the app is withheld until someone opens
 * their inbox — verification exists so password reset has somewhere real to
 * send a code, not as a wall in front of affirmations they just paid for. So
 * this is a card that can be put away, and the API is the authority on whether
 * it should appear at all.
 *
 * There is no offline path: a code can't be checked without the server, and
 * queuing "verify me" would be queuing a guess. Offline, the card simply says
 * so rather than pretending.
 */
export function useEmailVerification() {
  const { user, client, adoptUser } = useAuth();

  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  const verified = Boolean(user?.emailVerifiedAt);

  const resend = useCallback(async () => {
    setSending(true);
    setError(null);
    try {
      await client.sendEmailVerification();
      setSent(true);
    } catch (err) {
      setError(err);
      if (!(err instanceof NetworkError)) throw err;
    } finally {
      setSending(false);
    }
  }, [client]);

  const verify = useCallback(
    async (code) => {
      setVerifying(true);
      setError(null);
      try {
        const { user: fresh } = await client.verifyEmail(code);
        await adoptUser(fresh);
        return true;
      } catch (err) {
        setError(err);
        return false;
      } finally {
        setVerifying(false);
      }
    },
    [client, adoptUser],
  );

  return { verified, email: user?.email, sending, verifying, sent, error, resend, verify };
}
