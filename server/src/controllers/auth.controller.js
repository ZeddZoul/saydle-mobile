import { verify as argonVerify } from "@node-rs/argon2";
import { User, hashPassword } from "../models/User.js";
import { issueResetCode, consumeResetCode } from "../services/passwordReset.service.js";
import {
  issueVerificationCode,
  consumeVerificationCode,
} from "../services/emailVerification.service.js";
import {
  sendPasswordResetCode,
  sendEmailVerificationCode,
} from "../services/mailer.service.js";
import { resolveLocale } from "../config/locales.js";
import { AppError } from "../utils/AppError.js";
import {
  signAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeToken,
  revokeAllForUser,
} from "../services/token.service.js";

// Login must take about the same time whether or not the email exists, or the
// endpoint becomes an account-enumeration oracle. When there is no user to check
// against, we verify the supplied password against this throwaway hash instead.
let timingEqualizer;
function equalizerHash() {
  timingEqualizer ??= hashPassword("saydle-timing-equalizer");
  return timingEqualizer;
}

export async function register(req, res, next) {
  try {
    const { firstName, lastName, email, password, timezone, locale } = req.body;

    // The unique index is the real guard (see error.js, code 11000); this check
    // exists only to return a friendlier message on the common path.
    if (await User.exists({ email })) {
      throw AppError.conflict("An account with that email already exists.", {
        email: "Already registered.",
      });
    }

    const user = await User.create({
      firstName,
      lastName,
      email,
      passwordHash: await hashPassword(password),
      timezone: timezone ?? "UTC",
      // Unsupported languages fall back to English rather than being stored and
      // silently bypassing the per-language safety rules.
      locale: resolveLocale(locale),
    });

    const refreshToken = await issueRefreshToken(user._id, {
      userAgent: req.get("user-agent"),
    });

    // Best effort, and deliberately not awaited into the response contract: a
    // mail outage must not fail a registration. The app can always ask for
    // another code, and nothing is gated on being verified.
    await sendVerification(user).catch((err) =>
      req.log?.error({ err, userId: user.id }, "verification email failed"),
    );

    req.log?.info({ userId: user.id }, "user registered");

    res.status(201).json({
      user: user.toJSON(),
      accessToken: signAccessToken(user),
      refreshToken,
    });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select("+passwordHash");

    if (!user) {
      await argonVerify(await equalizerHash(), password).catch(() => false);
      throw AppError.unauthorized("Email or password is incorrect.");
    }

    const ok = await user.verifyPassword(password).catch(() => false);
    if (!ok) {
      throw AppError.unauthorized("Email or password is incorrect.");
    }

    const refreshToken = await issueRefreshToken(user._id, {
      userAgent: req.get("user-agent"),
    });

    res.json({
      user: user.toJSON(),
      accessToken: signAccessToken(user),
      refreshToken,
    });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req, res, next) {
  try {
    const { userId, refreshToken } = await rotateRefreshToken(
      req.body.refreshToken,
      { userAgent: req.get("user-agent") },
    );

    const user = await User.findById(userId);
    if (!user) {
      throw AppError.unauthorized("Account no longer exists.");
    }

    res.json({
      user: user.toJSON(),
      accessToken: signAccessToken(user),
      refreshToken,
    });
  } catch (err) {
    next(err);
  }
}

export async function logout(req, res, next) {
  try {
    // Unconditionally 204: whether the token existed is not the caller's business,
    // and a client logging out twice should not see an error.
    await revokeToken(req.body.refreshToken);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

async function sendVerification(user) {
  const code = await issueVerificationCode(user);
  return sendEmailVerificationCode({
    to: user.email,
    firstName: user.firstName,
    code,
  });
}

/**
 * Sends (or re-sends) a confirmation code to the signed-in user's address.
 *
 * Always 204, even when the address is already verified: the response says
 * nothing about account state, and there is nothing useful the client would do
 * differently — it already knows from `/me`.
 */
export async function sendEmailVerification(req, res, next) {
  try {
    if (!req.user.emailVerifiedAt) {
      await sendVerification(req.user);
      req.log?.info({ userId: req.user.id }, "verification code sent");
    }

    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

/**
 * Confirms an email address with a code.
 *
 * Nothing in the app is gated on this. Verification exists so that password
 * reset has somewhere real to send a code, and so we are not mailing people who
 * never asked — not as a wall in front of the affirmations someone just paid
 * for.
 */
export async function verifyEmail(req, res, next) {
  try {
    // Idempotent: tapping a stale code after it already worked is a success,
    // not an error to explain.
    if (req.user.emailVerifiedAt) {
      return res.json({ user: req.user.toJSON() });
    }

    const ok = await consumeVerificationCode(req.user, req.body.code);

    if (!ok) {
      throw AppError.badRequest("That code is invalid or has expired.", {
        code: "Check the code and try again.",
      });
    }

    req.user.emailVerifiedAt = new Date();
    await req.user.save();

    req.log?.info({ userId: req.user.id }, "email verified");
    res.json({ user: req.user.toJSON() });
  } catch (err) {
    next(err);
  }
}

export async function me(req, res) {
  res.json({ user: req.user.toJSON() });
}

export async function deleteMe(req, res, next) {
  try {
    await revokeAllForUser(req.user._id);
    await User.deleteOne({ _id: req.user._id });
    req.log?.info({ userId: req.user.id }, "account deleted");
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}


/**
 * Start a password reset.
 *
 * Always answers 204, whether or not the address exists. Anything else — a
 * different status, a different message, a noticeably different response time —
 * turns this into a way to discover who has an account.
 */
export async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (user) {
      const code = await issueResetCode(user._id);
      await sendPasswordResetCode({
        to: user.email,
        firstName: user.firstName,
        code,
      });
      req.log?.info({ userId: user.id }, "password reset requested");
    } else {
      // Log for rate-limit forensics, but tell the client nothing.
      req.log?.info({ email }, "password reset requested for unknown address");
    }

    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

/**
 * Complete a password reset.
 *
 * A wrong code, an expired code, and an unknown address are deliberately
 * indistinguishable to the client — the alternative is an oracle.
 *
 * On success every refresh token is revoked: if the reset happened because
 * someone else had the account, leaving their session alive would defeat it.
 */
export async function resetPassword(req, res, next) {
  try {
    const { email, code, password } = req.body;
    const user = await User.findOne({ email });

    const ok = user ? await consumeResetCode(user._id, code) : false;

    if (!ok) {
      throw AppError.badRequest("That code is invalid or has expired.", {
        code: "Check the code and try again.",
      });
    }

    user.passwordHash = await hashPassword(password);
    await user.save();

    await revokeAllForUser(user._id);
    req.log?.info({ userId: user.id }, "password reset completed");

    // No session is returned: they sign in again with the new password, which
    // also confirms it went in the way they expected.
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
