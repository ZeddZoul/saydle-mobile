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
