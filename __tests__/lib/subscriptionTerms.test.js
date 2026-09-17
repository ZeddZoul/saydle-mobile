import {
  describePackages,
  periodLabel,
  perLabel,
  subscriptionPeriod,
} from "../../lib/subscriptionTerms.js";
import { DEFAULT_LOCALE, setLocale, t } from "../../lib/i18n.js";

afterEach(() => setLocale(DEFAULT_LOCALE));

/**
 * The disclosure the stores require, derived from the offering.
 *
 * Nothing about money or duration is written into the app — see CLAUDE.md,
 * Pricing — so these check the derivation, not any particular price.
 */
describe("subscriptionPeriod", () => {
  it("reads the ISO 8601 period the store reports", () => {
    expect(subscriptionPeriod({ product: { subscriptionPeriod: "P1M" } })).toEqual({
      count: 1,
      unit: "month",
    });
    expect(subscriptionPeriod({ product: { subscriptionPeriod: "P1Y" } })).toEqual({
      count: 1,
      unit: "year",
    });
    expect(subscriptionPeriod({ product: { subscriptionPeriod: "P2W" } })).toEqual({
      count: 2,
      unit: "week",
    });
  });

  it("falls back to the RevenueCat package type when the product has no period", () => {
    expect(subscriptionPeriod({ packageType: "MONTHLY", product: {} })).toEqual({
      count: 1,
      unit: "month",
    });
    expect(subscriptionPeriod({ packageType: "ANNUAL" })).toEqual({ count: 1, unit: "year" });
    expect(subscriptionPeriod({ packageType: "SIX_MONTH" })).toEqual({
      count: 6,
      unit: "month",
    });
  });

  it("prefers the store's period over the package type when both exist", () => {
    // The product is what the receipt describes; the package is our label for it.
    expect(
      subscriptionPeriod({ packageType: "ANNUAL", product: { subscriptionPeriod: "P3M" } }),
    ).toEqual({ count: 3, unit: "month" });
  });

  it("has no period for a lifetime or custom package", () => {
    expect(subscriptionPeriod({ packageType: "LIFETIME", product: {} })).toBeNull();
    expect(subscriptionPeriod({ product: { subscriptionPeriod: "nonsense" } })).toBeNull();
    expect(subscriptionPeriod(undefined)).toBeNull();
  });
});

describe("labels", () => {
  it("reads as a length and as a rate", () => {
    expect(periodLabel(t, { count: 1, unit: "month" })).toBe("1 month");
    expect(periodLabel(t, { count: 3, unit: "month" })).toBe("3 months");
    expect(perLabel(t, { count: 1, unit: "year" })).toBe("per year");
    expect(perLabel(t, { count: 3, unit: "month" })).toBe("per 3 months");
  });

  it("follows the language", () => {
    setLocale("es");
    expect(periodLabel(t, { count: 1, unit: "year" })).toBe("1 año");
    expect(perLabel(t, { count: 1, unit: "month" })).toBe("al mes");
  });

  it("is nothing for no period", () => {
    expect(periodLabel(t, null)).toBeNull();
    expect(perLabel(t, null)).toBeNull();
  });
});

describe("describePackages", () => {
  it("names the term, its length and its price per length, from the store", () => {
    const [annual, monthly] = describePackages(t, [
      {
        identifier: "annual",
        packageType: "ANNUAL",
        product: {
          title: "Saydle Premium Yearly",
          priceString: "$49.99",
          subscriptionPeriod: "P1Y",
        },
      },
      {
        identifier: "monthly",
        packageType: "MONTHLY",
        product: { title: "Saydle Premium Monthly", priceString: "$9.99" },
      },
    ]);

    expect(annual).toMatchObject({
      title: "Saydle Premium Yearly",
      length: "1 year",
      price: "$49.99",
      line: "$49.99 per year",
    });
    expect(monthly).toMatchObject({ length: "1 month", line: "$9.99 per month" });
  });

  it("falls back to the identifier when the store gave no title", () => {
    const [pkg] = describePackages(t, [
      { identifier: "monthly", packageType: "MONTHLY", product: { priceString: "$9.99" } },
    ]);
    expect(pkg.title).toBe("monthly");
  });

  it("drops a package with no price — a term nobody can agree to", () => {
    expect(
      describePackages(t, [{ identifier: "x", packageType: "MONTHLY", product: {} }]),
    ).toEqual([]);
    expect(describePackages(t, [])).toEqual([]);
  });

  it("describes a one-off purchase without inventing a period", () => {
    const [pkg] = describePackages(t, [
      { identifier: "life", packageType: "LIFETIME", product: { priceString: "$99" } },
    ]);
    expect(pkg.length).toBeNull();
    expect(pkg.line).toBe("$99 once");
  });
});
