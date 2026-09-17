import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Paywall from "../../components/onboarding/Paywall.jsx";

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const PACKAGES = [
  {
    identifier: "annual",
    packageType: "ANNUAL",
    product: {
      title: "Saydle Premium Yearly",
      priceString: "$49.99",
      price: 49.99,
      currencyCode: "USD",
      subscriptionPeriod: "P1Y",
    },
  },
  {
    identifier: "monthly",
    packageType: "MONTHLY",
    product: {
      title: "Saydle Premium Monthly",
      priceString: "$9.99",
      subscriptionPeriod: "P1M",
    },
  },
];

const renderPaywall = (props = {}) =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <Paywall
        onSubscribe={jest.fn()}
        onContinueFree={jest.fn()}
        onBack={jest.fn()}
        onRestore={jest.fn()}
        onRetry={jest.fn()}
        {...props}
      />
    </SafeAreaProvider>,
  );

/**
 * A paywall someone can decline, back out of, or restore from.
 *
 * App Review rejects a subscription screen with no way past it; so does anyone
 * who came for the free product. The free plan is therefore always a button —
 * not a link, not hidden until a scroll — whether or not the store answered.
 */
describe("Paywall", () => {
  it("always offers the free plan, even with nothing to buy", async () => {
    const onContinueFree = jest.fn();
    const { findByTestId } = await renderPaywall({ onContinueFree, canPurchase: false });

    await fireEvent.press(await findByTestId("paywall-free"));

    expect(onContinueFree).toHaveBeenCalledTimes(1);
  });

  it("keeps the free plan next to the paid ones", async () => {
    const onContinueFree = jest.fn();
    const { findByTestId } = await renderPaywall({
      onContinueFree,
      canPurchase: true,
      packages: PACKAGES,
    });

    await findByTestId("paywall-plan-annual");
    await fireEvent.press(await findByTestId("paywall-free"));

    expect(onContinueFree).toHaveBeenCalledTimes(1);
  });

  it("hands the tapped plan to the controller, not whichever came first", async () => {
    const onSubscribe = jest.fn();
    const { findByTestId } = await renderPaywall({
      onSubscribe,
      canPurchase: true,
      packages: PACKAGES,
    });

    await fireEvent.press(await findByTestId("paywall-plan-monthly"));

    expect(onSubscribe).toHaveBeenCalledWith(PACKAGES[1]);
  });

  it("goes back to the last question", async () => {
    const onBack = jest.fn();
    const { findByTestId } = await renderPaywall({ onBack });

    await fireEvent.press(await findByTestId("paywall-back"));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("offers Restore purchases before an account exists", async () => {
    const onRestore = jest.fn();
    const { findByTestId, findByText } = await renderPaywall({ onRestore });

    await fireEvent.press(await findByText("Restore purchases"));

    // Nothing can be restored onto an account that does not exist yet, so
    // the control hands over to sign-in rather than pretending.
    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(await findByTestId("paywall-restore")).toBeTruthy();
  });

  describe("the plans", () => {
    it("says when the store gave nothing, and offers to ask again", async () => {
      const onRetry = jest.fn();
      const { findByTestId, findByText } = await renderPaywall({
        onRetry,
        canPurchase: true,
        packages: [],
        plansLoading: false,
      });

      await findByTestId("paywall-plans-failed");
      await fireEvent.press(await findByText("Try again"));

      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it("does not complain while the store is still being asked", async () => {
      const { findByTestId, queryByTestId } = await renderPaywall({
        canPurchase: true,
        packages: [],
        plansLoading: true,
      });

      await findByTestId("paywall-free");
      expect(queryByTestId("paywall-plans-failed")).toBeNull();
    });

    it("does not complain when there is no store to ask", async () => {
      // No RevenueCat key is a supported state, not a failed load.
      const { findByTestId, queryByTestId } = await renderPaywall({
        canPurchase: false,
        packages: [],
      });

      await findByTestId("paywall-free");
      expect(queryByTestId("paywall-plans-failed")).toBeNull();
    });
  });

  describe("the disclosure", () => {
    it("states each term's length and price per period, and that it renews", async () => {
      const { findByText } = await renderPaywall({ canPurchase: true, packages: PACKAGES });

      expect(
        await findByText(/Saydle Premium Yearly · 1 year · \$49\.99 per year/),
      ).toBeTruthy();
      expect(
        await findByText(/Saydle Premium Monthly · 1 month · \$9\.99 per month/),
      ).toBeTruthy();
      expect(
        await findByText(/Renews automatically at the same price until cancelled/),
      ).toBeTruthy();
      expect(await findByText(/App Store settings/)).toBeTruthy();
    });

    it("opens the Terms and the Privacy Policy", async () => {
      const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
      const { findByTestId } = await renderPaywall({ canPurchase: true, packages: PACKAGES });

      await fireEvent.press(await findByTestId("legal-terms"));
      await fireEvent.press(await findByTestId("legal-privacy"));

      await waitFor(() => expect(openURL).toHaveBeenCalledTimes(2));
      expect(openURL.mock.calls[0][0]).toMatch(/terms/);
      expect(openURL.mock.calls[1][0]).toMatch(/privacy/);
      openURL.mockRestore();
    });

    it("shows the per-month equivalent for the annual plan only", async () => {
      const { findByText, queryByText } = await renderPaywall({
        canPurchase: true,
        packages: PACKAGES,
      });

      // Arithmetic on the store's own number, never a figure of ours.
      expect(await findByText(/That's USD 4\.17 a month/)).toBeTruthy();
      expect(queryByText(/That's .* 9\.99 a month/)).toBeNull();
    });
  });

  it("names what premium actually adds, without a trial", async () => {
    const { findByText, queryByText } = await renderPaywall();

    expect(await findByText("Affirmations written from your answers")).toBeTruthy();
    expect(await findByText("Practice read aloud in a real voice")).toBeTruthy();
    expect(await findByText("Your own words, kept")).toBeTruthy();
    expect(queryByText(/trial/i)).toBeNull();
  });
});
