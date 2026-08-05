import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react-native";
import Login from "../../app/(auth)/login.jsx";
import { AuthProvider } from "../../contexts/AuthContext.jsx";
import { ApiError, NetworkError } from "../../lib/errors.js";

jest.mock("expo-router", () => ({
  Link: ({ children }) => children,
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useSegments: () => [],
}));

const store = () => ({
  hasSession: jest.fn(async () => false),
  getAccessToken: jest.fn(async () => null),
  getRefreshToken: jest.fn(async () => null),
  setSession: jest.fn(async () => {}),
  clear: jest.fn(async () => {}),
});

const cache = () => ({
  loadUser: jest.fn(async () => null),
  saveUser: jest.fn(async () => {}),
  loadFeed: jest.fn(async () => null),
  saveFeed: jest.fn(async () => {}),
  loadFavorites: jest.fn(async () => null),
  saveFavorites: jest.fn(async () => {}),
  clear: jest.fn(async () => {}),
});

// render, fireEvent and its helpers are all async in RNTL 14.
const renderLogin = (client) =>
  render(
    <AuthProvider store={store()} cache={cache()} client={client}>
      <Login />
    </AuthProvider>,
  );

const fillAndSubmit = async (
  email = "ada@example.com",
  password = "correct horse",
) => {
  await fireEvent.changeText(screen.getByLabelText("Email"), email);
  await fireEvent.changeText(screen.getByLabelText("Password"), password);
  await fireEvent.press(screen.getByText("Log in"));
};

describe("Login screen", () => {
  it("renders the form", async () => {
    await renderLogin({ me: jest.fn(), login: jest.fn() });

    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.getByText("Log in")).toBeTruthy();
  });

  it("submits the typed credentials", async () => {
    const login = jest.fn(async () => ({
      user: { id: "u1" },
      accessToken: "a1",
      refreshToken: "r1",
    }));

    await renderLogin({ me: jest.fn(), login });
    await fillAndSubmit();

    await waitFor(() =>
      expect(login).toHaveBeenCalledWith({
        email: "ada@example.com",
        password: "correct horse",
      }),
    );
  });

  it("shows field-level errors returned by the API", async () => {
    const login = jest.fn(async () => {
      throw new ApiError(400, "bad_request", "Request validation failed.", {
        email: "Enter a valid email address.",
      });
    });

    await renderLogin({ me: jest.fn(), login });
    await fillAndSubmit("nope", "correct horse");

    expect(
      await screen.findByText("Enter a valid email address."),
    ).toBeTruthy();
  });

  it("shows a friendly message when the server is unreachable", async () => {
    const login = jest.fn(async () => {
      throw new NetworkError(new Error("offline"));
    });

    await renderLogin({ me: jest.fn(), login });
    await fillAndSubmit();

    expect(await screen.findByText(/Could not reach Saydle/)).toBeTruthy();
  });

  it("shows the rejection message for bad credentials", async () => {
    const login = jest.fn(async () => {
      throw new ApiError(401, "unauthorized", "Email or password is incorrect.");
    });

    await renderLogin({ me: jest.fn(), login });
    await fillAndSubmit();

    expect(
      await screen.findByText("Email or password is incorrect."),
    ).toBeTruthy();
  });

  it("does not submit twice while a request is in flight", async () => {
    // A deferred login lets us hold the request open and inspect the in-flight
    // lock, without racing two presses against React's batching.
    let resolveLogin;
    const login = jest.fn(
      () =>
        new Promise((r) => {
          resolveLogin = r;
        }),
    );

    await renderLogin({ me: jest.fn(), login });

    await fireEvent.changeText(screen.getByLabelText("Email"), "ada@example.com");
    await fireEvent.changeText(
      screen.getByLabelText("Password"),
      "correct horse",
    );

    // First press starts the request but does not resolve it.
    fireEvent.press(screen.getByText("Log in"));

    // While it is in flight the submit button reports busy, which is also what
    // disables it — a second tap can't reach the handler. (The password field's
    // reveal toggle is also a button, so select the submit one by its busy state.)
    await waitFor(() => {
      const submit = screen
        .getAllByRole("button")
        .find((b) => b.props.accessibilityState?.busy);
      expect(submit).toBeTruthy();
      expect(submit.props.accessibilityState.disabled).toBe(true);
    });
    expect(login).toHaveBeenCalledTimes(1);

    // Let it finish so the test tears down cleanly.
    await act(async () => {
      resolveLogin({
        user: { id: "u1" },
        accessToken: "a1",
        refreshToken: "r1",
      });
    });
  });

  it("clears a field error once the user edits that field", async () => {
    const login = jest.fn(async () => {
      throw new ApiError(400, "bad_request", "Request validation failed.", {
        email: "Enter a valid email address.",
      });
    });

    await renderLogin({ me: jest.fn(), login });
    await fillAndSubmit("nope", "correct horse");

    await screen.findByText("Enter a valid email address.");

    fireEvent.changeText(screen.getByLabelText("Email"), "ada@example.com");

    await waitFor(() =>
      expect(screen.queryByText("Enter a valid email address.")).toBeNull(),
    );
  });
});
