import { renderHook, waitFor, act } from "@testing-library/react-native";
import { AuthProvider } from "../../contexts/AuthContext.jsx";
import { useSubscription } from "../../hooks/useSubscription.js";

/**
 * Subscription management, and the one rule the whole file turns on: the server
 * decides. Customer Center can cancel a subscription without the app being told
 * anything — the change reaches us through RevenueCat's webhook — so dismissing
 * the sheet has to end in a re-read rather than an assumption.
 */
// The factory must build the mocks itself. `jest.mock` is hoisted above every
// const in this file, so a factory that closes over one reads it as undefined
// at the moment the module under test is imported.
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

const makeClient = (over = {}) => ({
  me: jest.fn(async () => ({ user: USER })),
  subscription: jest.fn(async () => ({
    subscription: { status: "active", entitled: true, verified: true },
  })),
  favorites: jest.fn(async () => ({ favorites: [] })),
  ...over,
});

const renderSubscription = (client = makeClient()) =>
  renderHook(() => useSubscription(), {
    wrapper: ({ children }) => (
      <AuthProvider store={makeStore()} cache={makeCache()} client={client}>
        {children}
      </AuthProvider>
    ),
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockPurchases.purchasesAvailable.mockReturnValue(true);
  mockPurchases.customerCenterAvailable.mockReturnValue(true);
  mockPurchases.presentCustomerCenter.mockResolvedValue({
    available: true,
    dismissed: true,
  });
});

describe("managing a subscription", () => {
  it("re-reads the server after the sheet is dismissed", async () => {
    const client = makeClient();
    const { result } = await renderSubscription(client);

    await waitFor(() => expect(result.current.loading).toBe(false));
    const before = client.subscription.mock.calls.length;

    await act(async () => {
      await result.current.manageSubscription();
    });

    // The user may have cancelled in there. We only learn that from the
    // webhook, so believing our own stale copy would leave the screen saying
    // "Premium" to someone who just cancelled.
    expect(client.subscription.mock.calls.length).toBeGreaterThan(before);
  });

  it("does not re-read when the sheet never opened", async () => {
    mockPurchases.presentCustomerCenter.mockResolvedValue({ available: false });
    const client = makeClient();
    const { result } = await renderSubscription(client);

    await waitFor(() => expect(result.current.loading).toBe(false));
    const before = client.subscription.mock.calls.length;

    await act(async () => {
      await result.current.manageSubscription();
    });

    // Nothing was shown, so nothing can have changed — a refetch here would be
    // a request per tap on a button that did nothing.
    expect(client.subscription.mock.calls.length).toBe(before);
  });

  it("reports whether the sheet can be shown at all", async () => {
    mockPurchases.customerCenterAvailable.mockReturnValue(false);
    const { result } = await renderSubscription();

    await waitFor(() => expect(result.current.loading).toBe(false));

    // The screen needs this to choose its fallback rather than offering a
    // button that cannot work.
    expect(result.current.canManage).toBe(false);
  });

  it("clears busy even when presenting throws", async () => {
    mockPurchases.presentCustomerCenter.mockRejectedValue(new Error("boom"));
    const { result } = await renderSubscription();

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.manageSubscription().catch(() => {});
    });

    // A stuck `busy` disables every button on the screen permanently.
    expect(result.current.busy).toBe(false);
  });
});
