import request from "supertest";

let counter = 0;

/** Registers a fresh user and returns the response body plus a ready auth header. */
export async function registerUser(app, overrides = {}) {
  counter += 1;

  const res = await request(app)
    .post("/api/auth/register")
    .send({
      firstName: "Ada",
      lastName: "Lovelace",
      email: `user${counter}@example.com`,
      password: "correct horse battery",
      ...overrides,
    });

  if (res.status !== 201) {
    throw new Error(`registerUser failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return { ...res.body, auth: `Bearer ${res.body.accessToken}` };
}

/**
 * Make an account premium, the way a real one becomes premium.
 *
 * Tests used to call `startTrial` for this, which was the cheapest honest way
 * through the gate while a trial existed. It does not any more: entitlement now
 * arrives one way only, through the RevenueCat webhook, so this writes the
 * state that webhook writes. Mutates and saves, returning the user for chaining.
 */
export async function entitle(user, { days = 30 } = {}) {
  user.subscription.status = "active";
  user.subscription.expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  user.subscription.source = "app_store";
  user.subscription.verifiedAt = new Date();
  await user.save();
  return user;
}
