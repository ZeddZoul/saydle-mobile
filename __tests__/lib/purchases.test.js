/**
 * The IAP boundary in its two normal states: no native module (Expo Go) and no
 * key (no store listing yet). Both must be quiet non-events, because they are
 * how the app runs for most of its life before launch.
 */

const loadFresh = ({ key, module } = {}) => {
  jest.resetModules();

  jest.doMock("../../lib/config.js", () => ({
    REVENUECAT_KEY: key,
    ENTITLEMENT_ID: "premium",
  }));

  if (module === undefined) {
    // Simulates Expo Go: the JS package resolves, but the native side it needs
    // is absent, so requiring it throws.
    jest.doMock("react-native-purchases", () => {
      throw new Error("Cannot find native module 'RNPurchases'");
    });
  } else {
    jest.doMock("react-native-purchases", () => module);
  }

  // require, not import(): jest's ESM loader is off, and this module has to
  // be re-evaluated per test to pick up a different key/module combination.
  return require("../../lib/purchases.js");
};

const fakePurchases = (over = {}) => ({
  configure: jest.fn(async () => {}),
  logIn: jest.fn(async () => ({})),
  getOfferings: jest.fn(async () => ({
    current: { availablePackages: [{ identifier: "monthly" }] },
  })),
  purchasePackage: jest.fn(async () => ({
    customerInfo: { entitlements: { active: { premium: {} } } },
  })),
  restorePurchases: jest.fn(async () => ({ entitlements: { active: { premium: {} } } })),
  ...over,
});

afterEach(() => {
  jest.resetModules();
  jest.dontMock("react-native-purchases");
  jest.dontMock("../../lib/config.js");
});

describe("with no native module (Expo Go)", () => {
  it("reports purchases as unavailable rather than throwing", async () => {
    const purchases = loadFresh({ key: "appl_key" });

    expect(purchases.purchasesAvailable()).toBe(false);
    // Importing must not take down every screen that touches this file.
    await expect(purchases.identifyUser("u1")).resolves.toEqual({ available: false });
  });

  it("returns an empty offering instead of failing the paywall", async () => {
    const purchases = loadFresh({ key: "appl_key" });

    expect(await purchases.getOffering()).toEqual({ available: false, packages: [] });
  });
});

describe("with no key configured (no store listing yet)", () => {
  it("reports purchases as unavailable even though the module is present", async () => {
    const purchases = loadFresh({ key: undefined, module: fakePurchases() });

    expect(purchases.purchasesAvailable()).toBe(false);
  });

  it("never calls the store", async () => {
    const module = fakePurchases();
    const purchases = loadFresh({ key: undefined, module });

    await purchases.identifyUser("u1");
    await purchases.getOffering();
    await purchases.purchasePackage({ identifier: "monthly" });

    expect(module.configure).not.toHaveBeenCalled();
    expect(module.purchasePackage).not.toHaveBeenCalled();
  });
});

/**
 * The Test Store key, which is a loaded gun in a release build.
 *
 * A `test_` key makes real-looking purchases with no store behind them, and the
 * RevenueCat SDK refuses one outside development by showing an alert and
 * crashing the app. `EXPO_PUBLIC_*` values are inlined at build time, so a
 * production build cut on a machine whose .env still holds the test key ships
 * that crash — on launch, to everyone. These pin the refusal.
 */
describe("with a Test Store key", () => {
  // `await fn()`, not `return fn()`. Without the await the finally restores
  // __DEV__ the moment the callback hits its first await — so the second half of
  // every test below would run as a dev build and pass for the wrong reason.
  const withDev = async (dev, fn) => {
    const was = global.__DEV__;
    global.__DEV__ = dev;
    try {
      return await fn();
    } finally {
      global.__DEV__ = was;
    }
  };

  it("is usable in development, where that is the whole point", async () => {
    await withDev(true, async () => {
      const module = fakePurchases();
      const purchases = loadFresh({ key: "test_abc123", module });

      expect(purchases.purchasesAvailable()).toBe(true);
      await purchases.identifyUser("u1");
      expect(module.configure).toHaveBeenCalledWith({ apiKey: "test_abc123" });
      expect(module.logIn).toHaveBeenCalledWith("u1");
    });
  });

  it("is refused in a release build rather than crashing the app", async () => {
    await withDev(false, async () => {
      const module = fakePurchases();
      const purchases = loadFresh({ key: "test_abc123", module });

      expect(purchases.purchasesAvailable()).toBe(false);
      await expect(purchases.identifyUser("u1")).resolves.toEqual({
        available: false,
      });
      // Never handed to the SDK: reaching configure() is the crash.
      expect(module.configure).not.toHaveBeenCalled();
    });
  });

  it("degrades to an inert paywall instead of a dead app", async () => {
    await withDev(false, async () => {
      const purchases = loadFresh({ key: "test_abc123", module: fakePurchases() });

      // Same shape as "no key at all" — the state the paywall already handles.
      expect(await purchases.getOffering()).toEqual({ available: false, packages: [] });
      expect(await purchases.purchasePackage({})).toEqual({ available: false });
      expect(await purchases.restorePurchases()).toEqual({ available: false });
    });
  });

  it("leaves a real store key alone in a release build", async () => {
    await withDev(false, async () => {
      const purchases = loadFresh({ key: "appl_key", module: fakePurchases() });

      // The guard must key off the `test_` prefix, not off being a release.
      expect(purchases.purchasesAvailable()).toBe(true);
    });
  });
});

describe("fully configured", () => {
  it("identifies the account by our own user id", async () => {
    const module = fakePurchases();
    const purchases = loadFresh({ key: "appl_key", module });

    await purchases.identifyUser("user-123");

    // configure() never claims an id - it cannot, the paywall runs before the
    // account exists - so logIn is what attaches the customer. RevenueCat's
    // anonymous ids change on reinstall, and an entitlement we cannot match
    // back to an account is one someone paid for and lost.
    expect(module.configure).toHaveBeenCalledWith({ apiKey: "appl_key" });
    expect(module.logIn).toHaveBeenCalledWith("user-123");
  });

  it("returns the current offering's packages", async () => {
    const purchases = loadFresh({ key: "appl_key", module: fakePurchases() });

    const offering = await purchases.getOffering();
    expect(offering).toEqual({ available: true, packages: [{ identifier: "monthly" }] });
  });

  it("reports a completed purchase", async () => {
    const purchases = loadFresh({ key: "appl_key", module: fakePurchases() });

    expect(await purchases.purchasePackage({ identifier: "monthly" })).toMatchObject({
      purchased: true,
      entitled: true,
    });
  });

  it("treats cancelling as a plain outcome, not an error", async () => {
    const cancelled = Object.assign(new Error("cancelled"), { userCancelled: true });
    const purchases = loadFresh({
      key: "appl_key",
      module: fakePurchases({
        purchasePackage: jest.fn(async () => {
          throw cancelled;
        }),
      }),
    });

    // Saying no is the commonest outcome of showing a paywall; an alert would
    // be aimed at someone who just declined.
    expect(await purchases.purchasePackage({})).toEqual({
      available: true,
      purchased: false,
      cancelled: true,
    });
  });

  it("reports a real failure without throwing at the caller", async () => {
    const purchases = loadFresh({
      key: "appl_key",
      module: fakePurchases({
        purchasePackage: jest.fn(async () => {
          throw new Error("store unreachable");
        }),
      }),
    });

    const result = await purchases.purchasePackage({});
    expect(result.purchased).toBe(false);
    expect(result.cancelled).toBeUndefined();
    expect(result.error).toBeInstanceOf(Error);
  });

  it("restores what someone already paid for", async () => {
    const purchases = loadFresh({ key: "appl_key", module: fakePurchases() });

    // Apple requires this wherever a subscription is sold.
    expect(await purchases.restorePurchases()).toEqual({ available: true, entitled: true });
  });

  it("survives an offering call that fails", async () => {
    const purchases = loadFresh({
      key: "appl_key",
      module: fakePurchases({
        getOfferings: jest.fn(async () => {
          throw new Error("network");
        }),
      }),
    });

    const offering = await purchases.getOffering();
    expect(offering.packages).toEqual([]);
  });
});

/**
 * The deadlock that shipped.
 *
 * The onboarding paywall fetched offerings before anything configured the SDK.
 * getOfferings() threw, the boundary turned that into `packages: []`, and the
 * render guard hid every purchase button — while the only code that configured
 * the SDK sat behind those buttons. A new user could never subscribe, and with
 * a hard paywall that means never become a customer. Nothing logged an error,
 * because an empty offering is a state the paywall is designed to handle.
 */
describe("pricing the paywall before anyone has an account", () => {
  it("configures without an id, so the offering can be fetched pre-signup", async () => {
    const module = fakePurchases();
    const purchases = loadFresh({ key: "appl_key", module });

    await purchases.ensureConfigured();

    expect(module.configure).toHaveBeenCalledWith({ apiKey: "appl_key" });
    // No appUserID: there is no user yet. logIn attaches one later.
    expect(module.configure.mock.calls[0][0]).not.toHaveProperty("appUserID");
    expect(module.logIn).not.toHaveBeenCalled();
  });

  it("returns real packages once configured", async () => {
    const purchases = loadFresh({ key: "appl_key", module: fakePurchases() });

    await purchases.ensureConfigured();

    expect(await purchases.getOffering()).toEqual({
      available: true,
      packages: [{ identifier: "monthly" }],
    });
  });

  it("configures only once, however many times the paywall mounts", async () => {
    // The SDK may only be configured once; a second call with a different id
    // does not switch user, it keeps the first and warns. The paywall effect
    // can run repeatedly, so this has to be idempotent.
    const module = fakePurchases();
    const purchases = loadFresh({ key: "appl_key", module });

    await purchases.ensureConfigured();
    await purchases.ensureConfigured();
    await purchases.ensureConfigured();

    expect(module.configure).toHaveBeenCalledTimes(1);
  });

  it("identifies without configuring a second time", async () => {
    const module = fakePurchases();
    const purchases = loadFresh({ key: "appl_key", module });

    await purchases.ensureConfigured();
    await purchases.identifyUser("user-123");

    expect(module.configure).toHaveBeenCalledTimes(1);
    expect(module.logIn).toHaveBeenCalledWith("user-123");
  });

  it("configures on demand when identify is called first", async () => {
    // Profile → billing reaches identifyUser without the paywall having run.
    const module = fakePurchases();
    const purchases = loadFresh({ key: "appl_key", module });

    await purchases.identifyUser("user-123");

    expect(module.configure).toHaveBeenCalledTimes(1);
    expect(module.logIn).toHaveBeenCalledWith("user-123");
  });

  it("refuses to identify nobody rather than logging in as undefined", async () => {
    const module = fakePurchases();
    const purchases = loadFresh({ key: "appl_key", module });

    const result = await purchases.identifyUser(undefined);

    expect(result.available).toBe(false);
    expect(module.logIn).not.toHaveBeenCalled();
  });

  it("stays quiet when configure itself fails", async () => {
    const module = fakePurchases({
      configure: jest.fn(async () => {
        throw new Error("network");
      }),
    });
    const purchases = loadFresh({ key: "appl_key", module });

    const result = await purchases.ensureConfigured();

    expect(result.available).toBe(false);
    // Not latched: a transient failure must not permanently disable purchases.
    await purchases.ensureConfigured();
    expect(module.configure).toHaveBeenCalledTimes(2);
  });
});

/**
 * Identity is a network call, and callers must treat it as one.
 *
 * `Purchases.configure()` is synchronous and void — it assigns identity
 * locally and cannot fail on a network. `Purchases.logIn()` is a backend
 * round-trip that can reject, and when it does the SDK stays the anonymous
 * customer it was configured as. A purchase made in that state charges the card
 * and posts `app_user_id: "$RCAnonymousID:…"`, which the server cannot resolve.
 */
describe("when logIn fails", () => {
  it("reports it rather than pretending the user is identified", async () => {
    const module = fakePurchases({
      logIn: jest.fn(async () => {
        throw new Error("network");
      }),
    });
    const purchases = loadFresh({ key: "appl_key", module });

    const result = await purchases.identifyUser("user-123");

    expect(result.available).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("leaves the SDK configured, so a later attempt can still succeed", async () => {
    const logIn = jest
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({});
    const module = fakePurchases({ logIn });
    const purchases = loadFresh({ key: "appl_key", module });

    expect((await purchases.identifyUser("user-123")).available).toBe(false);
    expect((await purchases.identifyUser("user-123")).available).toBe(true);

    // configure() is once-only; the retry must not attempt it again.
    expect(module.configure).toHaveBeenCalledTimes(1);
    expect(logIn).toHaveBeenCalledTimes(2);
  });
});

describe("monthlyEquivalent", () => {
  const annual = (price, currencyCode = "USD") => ({
    packageType: "ANNUAL",
    product: { price, currencyCode },
  });

  it("divides the store's own annual price by twelve", () => {
    const purchases = loadFresh({ key: "appl_key", module: fakePurchases() });
    expect(purchases.monthlyEquivalent(annual(49.99))).toBe("USD 4.17");
  });

  it("carries the currency, because a bare number is ambiguous", () => {
    // The locked screen had a second copy of this that dropped the code and
    // rendered "That's 4.17 a month" beside a price in dollars.
    const purchases = loadFresh({ key: "appl_key", module: fakePurchases() });
    expect(purchases.monthlyEquivalent(annual(59.88, "GBP"))).toBe("GBP 4.99");
  });

  it("says nothing about a monthly package", () => {
    // "That's 9.99 a month" under a monthly plan is noise.
    const purchases = loadFresh({ key: "appl_key", module: fakePurchases() });
    expect(
      purchases.monthlyEquivalent({ packageType: "MONTHLY", product: { price: 9.99 } }),
    ).toBeNull();
  });

  it("says nothing when the store gave no price", () => {
    const purchases = loadFresh({ key: "appl_key", module: fakePurchases() });
    expect(purchases.monthlyEquivalent({ packageType: "ANNUAL", product: {} })).toBeNull();
    expect(purchases.monthlyEquivalent(undefined)).toBeNull();
  });
});
