import { render, fireEvent, waitFor } from "@testing-library/react-native";
import DeleteAccountSheet from "../../components/DeleteAccountSheet.jsx";
import { ApiError } from "../../lib/errors.js";

/**
 * The two locks on the door out.
 *
 * The password proves it is them; typing the address proves they meant it. Both
 * are enforced on the server too — these tests are about the door not opening by
 * accident, which is the half a server check cannot do.
 */
const EMAIL = "ada@example.com";

const renderSheet = (props = {}) =>
  render(
    <DeleteAccountSheet
      visible
      email={EMAIL}
      graceDays={30}
      onClose={() => {}}
      onConfirm={async () => {}}
      {...props}
    />,
  );

describe("DeleteAccountSheet", () => {
  it("keeps the button disabled until both are given", async () => {
    const { findByTestId } = await renderSheet();

    const submit = await findByTestId("delete-submit");
    expect(submit.props.accessibilityState?.disabled).toBe(true);

    await fireEvent.changeText(await findByTestId("delete-password"), "correct horse battery");
    // Password alone is not enough — that is the whole point of the second field.
    expect((await findByTestId("delete-submit")).props.accessibilityState?.disabled).toBe(true);
  });

  it("refuses an address that is close but wrong", async () => {
    const onConfirm = jest.fn();
    const { findByTestId } = await renderSheet({ onConfirm });

    await fireEvent.changeText(await findByTestId("delete-password"), "correct horse battery");
    await fireEvent.changeText(await findByTestId("delete-confirm"), "ada@example.co");
    await fireEvent.press(await findByTestId("delete-submit"));

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("accepts the address however it was capitalised or padded", async () => {
    const onConfirm = jest.fn(async () => {});
    const { findByTestId } = await renderSheet({ onConfirm });

    await fireEvent.changeText(await findByTestId("delete-password"), "correct horse battery");
    // A keyboard that capitalises the first letter must not read as the wrong
    // account — the server lowercases before comparing, and so do we.
    await fireEvent.changeText(await findByTestId("delete-confirm"), "  Ada@Example.com ");
    await fireEvent.press(await findByTestId("delete-submit"));

    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith({
        password: "correct horse battery",
        confirmEmail: "Ada@Example.com",
      }),
    );
  });

  it("shows the server's message and clears only the password", async () => {
    const onConfirm = jest.fn(async () => {
      throw new ApiError(401, { message: "That password is incorrect." });
    });
    const { findByTestId, findByRole } = await renderSheet({ onConfirm });

    await fireEvent.changeText(await findByTestId("delete-password"), "wrong");
    await fireEvent.changeText(await findByTestId("delete-confirm"), EMAIL);
    await fireEvent.press(await findByTestId("delete-submit"));

    await findByRole("alert");
    // Retyping the address after a wrong password would read as punishment.
    expect((await findByTestId("delete-confirm")).props.value).toBe(EMAIL);
    expect((await findByTestId("delete-password")).props.value).toBe("");
  });

  it("says that a paid subscription is not cancelled by this", async () => {
    const { findByText } = await renderSheet();

    // Someone who assumes deleting stops the billing keeps getting charged.
    expect(await findByText(/App Store or Play Store/i)).toBeTruthy();
  });

  it("promises the grace period, and says what actually cancels", async () => {
    const { findByText } = await renderSheet();

    expect(await findByText(/30 days/)).toBeTruthy();
    // Signing in only makes the cancel reachable; the card on Today is the
    // cancel. Copy that said "sign back in to cancel" promised something
    // signing in does not do.
    expect(await findByText(/sign in and tap Keep my account/i)).toBeTruthy();
  });
});
