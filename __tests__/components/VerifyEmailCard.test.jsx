import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { AuthProvider } from "../../contexts/AuthContext.jsx";
import VerifyEmailCard from "../../components/VerifyEmailCard.jsx";
import { ApiError, NetworkError } from "../../lib/errors.js";

const USER = { id: "u1", firstName: "Ada", email: "ada@example.com", emailVerifiedAt: null };

function makeStore() {
  return {
    hasSession: jest.fn(async () => true),
    getAccessToken: jest.fn(async () => "a1"),
    getRefreshToken: jest.fn(async () => "r1"),
    setSession: jest.fn(async () => {}),
    clear: jest.fn(async () => {}),
  };
}

function makeCache(user = USER) {
  return {
    loadUser: jest.fn(async () => user),
    saveUser: jest.fn(async () => {}),
    loadFeed: jest.fn(async () => null),
    saveFeed: jest.fn(async () => {}),
    loadFavorites: jest.fn(async () => null),
    saveFavorites: jest.fn(async () => {}),
    loadOutbox: jest.fn(async () => []),
    saveOutbox: jest.fn(async () => {}),
    clear: jest.fn(async () => {}),
  };
}

const baseClient = (user = USER, over = {}) => ({
  me: jest.fn(async () => ({ user })),
  sendEmailVerification: jest.fn(async () => {}),
  verifyEmail: jest.fn(async () => ({
    user: { ...user, emailVerifiedAt: "2026-08-05T10:00:00Z" },
  })),
  ...over,
});

const renderCard = ({ user = USER, client = baseClient(user) } = {}) =>
  render(
    <AuthProvider store={makeStore()} cache={makeCache(user)} client={client}>
      <VerifyEmailCard />
    </AuthProvider>,
  );

describe("VerifyEmailCard", () => {
  it("asks an unverified account to confirm, naming the address", async () => {
    const { findByTestId, findAllByText } = await renderCard();

    await findByTestId("verify-email-card");
    // Both the title and the body name it, hence findAll.
    expect((await findAllByText(/ada@example\.com/)).length).toBeGreaterThan(0);
  });

  it("interpolates the address into the title, not just the body", async () => {
    // Caught on device: the title read "Is {{email}} right?" because the
    // interpolation argument was missing. The earlier assertion above passed
    // regardless, because it matched the body — so this one names the title.
    const { findByText, queryByText } = await renderCard();

    expect(await findByText("Is ada@example.com right?")).toBeTruthy();
    expect(queryByText(/\{\{/)).toBeNull();
  });

  it("shows nothing once the account is verified", async () => {
    const verified = { ...USER, emailVerifiedAt: "2026-08-05T10:00:00Z" };
    const { queryByTestId } = await renderCard({ user: verified });

    await waitFor(() => expect(queryByTestId("verify-email-card")).toBeNull());
  });

  it("accepts only digits, and only six of them", async () => {
    const { findByLabelText } = await renderCard();
    const input = await findByLabelText("Confirmation code");

    await fireEvent.changeText(input, "12a3b4c56789");

    expect(input.props.value).toBe("123456");
  });

  it("will not submit a half-typed code", async () => {
    const client = baseClient();
    const { findByText, findByLabelText } = await renderCard({ client });

    await fireEvent.changeText(await findByLabelText("Confirmation code"), "123");
    await fireEvent.press(await findByText("Confirm"));

    expect(client.verifyEmail).not.toHaveBeenCalled();
  });

  it("verifies and thanks them, rather than staying on screen", async () => {
    const client = baseClient();
    const { findByText, findByLabelText, findByTestId } = await renderCard({ client });

    await fireEvent.changeText(await findByLabelText("Confirmation code"), "123456");
    await fireEvent.press(await findByText("Confirm"));

    expect(client.verifyEmail).toHaveBeenCalledWith("123456");
    await findByTestId("verify-email-done");
  });

  it("clears the field and says why when the code is wrong", async () => {
    const client = baseClient(USER, {
      verifyEmail: jest.fn(async () => {
        throw new ApiError(400, "invalid", "That code is invalid or has expired.");
      }),
    });
    const { findByText, findByLabelText, findByRole } = await renderCard({ client });

    const input = await findByLabelText("Confirmation code");
    await fireEvent.changeText(input, "000000");
    await fireEvent.press(await findByText("Confirm"));

    await findByRole("alert");
    // Cleared, so the next attempt starts from empty rather than a stale guess.
    await waitFor(() => expect(input.props.value).toBe(""));
  });

  it("resends on request and says so", async () => {
    const client = baseClient();
    const { findByText } = await renderCard({ client });

    await fireEvent.press(await findByText("Resend"));

    expect(client.sendEmailVerification).toHaveBeenCalled();
    expect(await findByText(/new code is on its way/i)).toBeTruthy();
  });

  it("reports an unreachable server instead of claiming a code was sent", async () => {
    const client = baseClient(USER, {
      sendEmailVerification: jest.fn(async () => {
        throw new NetworkError(new Error("offline"));
      }),
    });
    const { findByText, findByRole, queryByText } = await renderCard({ client });

    await fireEvent.press(await findByText("Resend"));

    await findByRole("alert");
    expect(queryByText(/new code is on its way/i)).toBeNull();
  });

  it("stops naming the address when it does not have one", async () => {
    const anonymous = { id: "u1", emailVerifiedAt: null };
    const { findByText, queryByText } = await renderCard({ user: anonymous });

    // "Is  right?" reads as a typo rather than as missing data, and this is the
    // first card a new account is shown.
    expect(await findByText("Is your email right?")).toBeTruthy();
    expect(queryByText(/^Is\s+right\?$/)).toBeNull();
  });

  it("can be put away — verification is not a wall", async () => {
    const { findByText, queryByTestId } = await renderCard();

    await fireEvent.press(await findByText("Later"));

    // Nothing in the app is gated on this, so dismissing costs the user nothing.
    await waitFor(() => expect(queryByTestId("verify-email-card")).toBeNull());
  });
});
