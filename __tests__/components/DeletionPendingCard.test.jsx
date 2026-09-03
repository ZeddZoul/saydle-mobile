import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../../contexts/AuthContext.jsx";
import { ToastProvider } from "../../contexts/ToastContext.jsx";
import DeletionPendingCard from "../../components/DeletionPendingCard.jsx";
import { NetworkError } from "../../lib/errors.js";

const USER = { id: "u1", firstName: "Ada", email: "ada@example.com" };
const PENDING = {
  ...USER,
  deletion: {
    pending: true,
    requestedAt: "2026-09-01T00:00:00Z",
    purgeAfter: "2026-10-01T12:00:00Z",
  },
};
const RESTORED = { ...USER, deletion: { pending: false, requestedAt: null, purgeAfter: null } };

const makeStore = () => ({
  hasSession: jest.fn(async () => true),
  getAccessToken: jest.fn(async () => "a1"),
  getRefreshToken: jest.fn(async () => "r1"),
  setSession: jest.fn(async () => {}),
  clear: jest.fn(async () => {}),
});

const makeCache = (user) => ({
  loadUser: jest.fn(async () => user),
  saveUser: jest.fn(async () => {}),
  loadFeed: jest.fn(async () => null),
  saveFeed: jest.fn(async () => {}),
  loadFavorites: jest.fn(async () => null),
  saveFavorites: jest.fn(async () => {}),
  loadOutbox: jest.fn(async () => []),
  saveOutbox: jest.fn(async () => {}),
  clear: jest.fn(async () => {}),
});

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderCard = ({ user = PENDING, client } = {}) =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <AuthProvider
        store={makeStore()}
        cache={makeCache(user)}
        client={
          client ?? {
            me: jest.fn(async () => ({ user })),
            restoreMe: jest.fn(async () => ({ user: RESTORED, restored: true })),
          }
        }
      >
        <ToastProvider>
          <DeletionPendingCard />
        </ToastProvider>
      </AuthProvider>
    </SafeAreaProvider>,
  );

/**
 * The cancel. Signing back in only makes it reachable.
 *
 * The old copy promised that signing in undid a deletion; it did not, and an
 * account could be purged under someone who thought they had saved it. This
 * card is the one thing that actually calls the server.
 */
describe("DeletionPendingCard", () => {
  it("names the date and offers to keep the account", async () => {
    const { findByTestId, findByText } = await renderCard();

    await findByTestId("deletion-pending-card");
    expect(await findByText(/scheduled for deletion on .*2026/)).toBeTruthy();
    expect(await findByText("Keep my account")).toBeTruthy();
  });

  it("is absent for an account that is not pending", async () => {
    const { queryByTestId } = await renderCard({ user: USER });

    await waitFor(() => expect(queryByTestId("deletion-pending-card")).toBeNull());
  });

  it("keeps the account through the server, then goes away", async () => {
    const client = {
      me: jest.fn(async () => ({ user: PENDING })),
      restoreMe: jest.fn(async () => ({ user: RESTORED, restored: true })),
    };
    const { findByTestId, queryByTestId, findByText } = await renderCard({ client });

    await fireEvent.press(await findByTestId("deletion-keep"));

    await waitFor(() => expect(client.restoreMe).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(queryByTestId("deletion-pending-card")).toBeNull());
    expect(await findByText(/Nothing will be deleted/)).toBeTruthy();
  });

  it("stays, and says why, when the server cannot be reached", async () => {
    const client = {
      me: jest.fn(async () => ({ user: PENDING })),
      restoreMe: jest.fn(async () => {
        throw new NetworkError(new Error("offline"));
      }),
    };
    const { findByTestId, findByText } = await renderCard({ client });

    await fireEvent.press(await findByTestId("deletion-keep"));

    expect(await findByText(/Could not reach Saydle/)).toBeTruthy();
    // Still counting down, because it still is.
    expect(await findByTestId("deletion-pending-card")).toBeTruthy();
  });

  it("can be put away for the session without touching the countdown", async () => {
    const client = {
      me: jest.fn(async () => ({ user: PENDING })),
      restoreMe: jest.fn(),
    };
    const { findByTestId, queryByTestId } = await renderCard({ client });

    await fireEvent.press(await findByTestId("deletion-dismiss"));

    await waitFor(() => expect(queryByTestId("deletion-pending-card")).toBeNull());
    expect(client.restoreMe).not.toHaveBeenCalled();
  });

  it("comes back on the next launch while the account is still pending", async () => {
    // Dismissal is component state, never persisted: a fresh mount — the
    // next launch — shows it again. That is the whole safeguard.
    const first = await renderCard();
    await fireEvent.press(await first.findByTestId("deletion-dismiss"));
    first.unmount();

    const second = await renderCard();
    expect(await second.findByTestId("deletion-pending-card")).toBeTruthy();
  });
});
