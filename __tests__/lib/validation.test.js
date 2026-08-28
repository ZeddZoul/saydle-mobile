import { validateEmail, validateLogin, hasErrors } from "../../lib/validation.js";

describe("validateEmail", () => {
  it("accepts a normal address", () => {
    expect(validateEmail("ada@example.com")).toBeUndefined();
    expect(validateEmail("  ada@example.com  ")).toBeUndefined();
  });

  it("requires a value", () => {
    expect(validateEmail("")).toMatch(/required/i);
    expect(validateEmail(undefined)).toMatch(/required/i);
  });

  it.each(["nope", "no@domain", "@example.com", "a b@example.com", "a@b c.com"])(
    "rejects %j",
    (bad) => {
      expect(validateEmail(bad)).toMatch(/valid email/i);
    },
  );
});

describe("validateLogin", () => {
  it("passes with an email and any password", () => {
    expect(validateLogin({ email: "ada@example.com", password: "x" })).toEqual({});
  });

  it("flags a missing password and a bad email", () => {
    const errors = validateLogin({ email: "nope", password: "" });
    expect(errors.email).toMatch(/valid email/i);
    expect(errors.password).toMatch(/required/i);
    expect(hasErrors(errors)).toBe(true);
  });
});
