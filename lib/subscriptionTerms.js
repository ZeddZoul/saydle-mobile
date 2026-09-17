/**
 * The words a subscription has to be sold with.
 *
 * Apple and Google both require the paywall to state, next to the buy button,
 * how long each period is, what it costs per period, and that it renews until
 * cancelled. Everything here is derived from the store's own package: the price
 * is `priceString` verbatim, and the length comes from the product's ISO 8601
 * `subscriptionPeriod` ("P1M", "P1Y"), falling back to RevenueCat's
 * `packageType` when the platform did not report one. Nothing about money or
 * duration is written into this file — see CLAUDE.md, Pricing.
 */

/** ISO 8601 duration units → the plural-key stem in `billing.period`. */
const UNITS = { D: "day", W: "week", M: "month", Y: "year" };

/** RevenueCat package types, for a product that carries no ISO period. */
const PACKAGE_PERIODS = {
  WEEKLY: { count: 1, unit: "week" },
  MONTHLY: { count: 1, unit: "month" },
  TWO_MONTH: { count: 2, unit: "month" },
  THREE_MONTH: { count: 3, unit: "month" },
  SIX_MONTH: { count: 6, unit: "month" },
  ANNUAL: { count: 1, unit: "year" },
};

/**
 * `{ count, unit }` for a package, or null when it is not a renewing term.
 *
 * "P1M" → one month, "P1Y" → one year, "P2W" → two weeks. A lifetime or
 * custom package has no period, and the disclosure simply omits the length.
 */
export function subscriptionPeriod(pkg) {
  const iso = pkg?.product?.subscriptionPeriod;
  const match = typeof iso === "string" && /^P(\d+)([DWMY])$/i.exec(iso.trim());

  if (match) {
    const count = Number(match[1]);
    const unit = UNITS[match[2].toUpperCase()];
    if (count > 0 && unit) return { count, unit };
  }

  return PACKAGE_PERIODS[pkg?.packageType] ?? null;
}

// Plurals resolved here rather than by i18next's `_one`/`_other` suffixes,
// which need Intl.PluralRules — present in Node, not guaranteed on every
// Hermes build. Two keys per unit is simpler and cannot silently degrade.
const unitKey = (period) => (period.count === 1 ? period.unit : `${period.unit}s`);

/** "1 month", "3 months", "1 year" — in the current language. */
export function periodLabel(t, period) {
  if (!period) return null;
  return t(`billing.period.${unitKey(period)}`, { count: period.count });
}

/** "per month", "per 3 months", "per year" — what the price is *per*. */
export function perLabel(t, period) {
  if (!period) return null;
  return t(`billing.per.${unitKey(period)}`, { count: period.count });
}

/**
 * One line per package, ready to render: title, length, and price per length.
 *
 * The title is the store's product title when it has one, so the disclosure
 * names exactly what the receipt will. Packages with no price string are
 * dropped — a term without a price is not something anyone can agree to.
 */
export function describePackages(t, packages = []) {
  return packages
    .filter((pkg) => pkg?.product?.priceString)
    .map((pkg) => {
      const period = subscriptionPeriod(pkg);
      const length = periodLabel(t, period);
      const price = pkg.product.priceString;

      return {
        id: pkg.identifier,
        title: pkg.product.title || pkg.identifier,
        length,
        price,
        line: period
          ? t("billing.planTerm", { price, per: perLabel(t, period) })
          : t("billing.planTermOnce", { price }),
      };
    });
}
