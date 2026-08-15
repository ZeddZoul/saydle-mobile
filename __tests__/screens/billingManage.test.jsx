import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Billing from "../../app/(dashboard)/billing.jsx";
import { AuthProvider } from "../../contexts/AuthContext.jsx";
import { ToastProvider } from "../../contexts/ToastContext.jsx";

jest.mock("expo-router", () => ({
  useFocusEffect: (cb) => require("react").useEffect(cb, [cb]),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}));

// See useSubscription.test.jsx: the factory cannot close over a const, because
// jest.mock is hoisted above every declaration in the file.
jest.mock("../../lib/purchases.js", () => ({
  purchasesAvailable: jest.fn(() => true),
  customerCenterAvailable: jest.fn(() => true),
  configurePurchases: jest.fn(async () => ({ available: true })),
  getOffering: jest.fn(async () => ({ available: true, packages: [] })),
  purchasePackage: jest.fn(async () => ({ available: true, purchased: true })),
  restorePurchases: jest.fn(async () => ({ available: true, entitled: true })),
  presentCustomerCenter: jest.fn(async () => ({ available: true, dismissed: true })),
}));

const mockPurchases = jest.requireMock("../../lib/purchases.js");

const USER = { id: "u1", firstName: "Ada", email: "ada@example.com" };

const makeStore = () => ({
  hasSession: jest.fn(async () => true),
  getAccessToken: jest.fn(async () => "a1"),
  getRefreshToken: jest.fn(async () => "r1"),
  setSession: jest.fn(async () => {}),
  clear: jest.fn(async () => {}),
});

const makeCache = () => ({
  loadUser: jest.fn(async () => USER),
  saveUser: jest.fn(async () => {}),
  loadFeed: jest.fn(async () => null),
  saveFeed: jest.fn(async () => {}),
  loadFavorites: jest.fn(async () => []),
  saveFavorites: jest.fn(async () => {}),
  loadOutbox: jest.fn(async () => []),
  saveOutbox: jest.fn(async () => {}),
  clear: jest.fn(async () => {}),
});

const makeClient = () => ({
  me: jest.fn(async () => ({ user: USER })),
  subscription: jest.fn(async () => ({
    subscription: { status: "active", entitled: true, verified: true },
  })),
  favorites: jest.fn(async () => ({ favorites: [] })),
});

// ToastProvider reads safe-area insets, which have no value under test unless a
// provider supplies them.
const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderBilling = () =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <AuthProvider store={makeStore()} cache={makeCache()} client={makeClient()}>
        <ToastProvider>
          <Billing />
        </ToastProvider>
      </AuthProvider>
    </SafeAreaProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockPurchases.customerCenterAvailable.mockReturnValue(true);
  mockPurchases.presentCustomerCenter.mockResolvedValue({
    available: true,
    dismissed: true,
  });
});

/**
 * The manage control has to work on a build with no Customer Center — Expo Go,
 * or any build where only the purchases module is linked. The fallback is the
 * store deep-link the screen used before, so nobody is left with a button that
 * throws.
 */
describe("managing a subscription from the paywall", () => {
  it("opens Customer Center when it is there", async () => {
    const { findByTestId } = await renderBilling();

    await fireEvent.press(await findByTestId("billing-manage"));

    await waitFor(() => expect(mockPurchases.presentCustomerCenter).toHaveBeenCalled());
  });

  it("falls back to the store when Customer Center is missing", async () => {
    mockPurchases.customerCenterAvailable.mockReturnValue(false);
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);

    const { findByTestId } = await renderBilling();
    await fireEvent.press(await findByTestId("billing-manage"));

    await waitFor(() => expect(openURL).toHaveBeenCalled());
    expect(mockPurchases.presentCustomerCenter).not.toHaveBeenCalled();

    openURL.mockRestore();
  });

  it("falls back rather than failing when presenting reports unavailable", async () => {
    // The module is present but the sheet cannot show — a race the screen must
    // survive, since canManage was read a render earlier.
    mockPurchases.presentCustomerCenter.mockResolvedValue({ available: false });
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);

    const { findByTestId } = await renderBilling();
    await fireEvent.press(await findByTestId("billing-manage"));

    await waitFor(() => expect(openURL).toHaveBeenCalled());

    openURL.mockRestore();
  });
});
