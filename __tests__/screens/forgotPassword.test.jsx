import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import ForgotPassword from "../../app/(auth)/forgot-password.jsx";
import { AuthProvider } from "../../contexts/AuthContext.jsx";
import { ToastProvider } from "../../contexts/ToastContext.jsx";
import { ApiError } from "../../lib/errors.js";

// `mock`-prefixed so jest's hoisted factory is allowed to close over it.
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  useSegments: () => [],
  Link: ({ children }) => children,
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

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
  loadStreak: jest.fn(async () => null),
  saveStreak: jest.fn(async () => {}),
  clear: jest.fn(async () => {}),
});

const renderScreen = (client) =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <AuthProvider store={store()} cache={cache()} client={client}>
        <ToastProvider>
          <ForgotPassword />
        </ToastProvider>
      </AuthProvider>
    </SafeAreaProvider>,
  );

const baseClient = () => ({
  me: jest.fn(),
  forgotPassword: jest.fn(async () => null),
  resetPassword: jest.fn(async () => null),
});

beforeEach(() => jest.clearAllMocks());

describe("requesting a code", () => {
  it("asks for the email first", async () => {
    const view = await renderScreen(baseClient());

    expect(await view.findByLabelText("Email")).toBeTruthy();
    expect(view.queryByLabelText("Code")).toBeNull();
  });

  it("does not call the API for a malformed email", async () => {
    const client = baseClient();
    const view = await renderScreen(client);

    await fireEvent.changeText(await view.findByLabelText("Email"), "nope");
    await fireEvent.press(view.getByText("Send code"));

    expect(client.forgotPassword).not.toHaveBeenCalled();
    expect(await view.findByText(/valid email/i)).toBeTruthy();
  });

  it("moves to the code step once the request is sent", async () => {
    const client = baseClient();
    const view = await renderScreen(client);

    await fireEvent.changeText(await view.findByLabelText("Email"), "ada@example.com");
    await fireEvent.press(view.getByText("Send code"));

    await waitFor(() => expect(client.forgotPassword).toHaveBeenCalledWith("ada@example.com"));
    expect(await view.findByLabelText("Code")).toBeTruthy();
  });

  it("advances even for an unknown address, so the screen reveals nothing", async () => {
    // The API answers identically either way; the UI must not undo that.
    const client = baseClient();
    const view = await renderScreen(client);

    await fireEvent.changeText(await view.findByLabelText("Email"), "nobody@example.com");
    await fireEvent.press(view.getByText("Send code"));

    expect(await view.findByLabelText("Code")).toBeTruthy();
  });
});

describe("submitting the reset", () => {
  const toCodeStep = async (client) => {
    const view = await renderScreen(client);
    await fireEvent.changeText(await view.findByLabelText("Email"), "ada@example.com");
    await fireEvent.press(view.getByText("Send code"));
    await view.findByLabelText("Code");
    return view;
  };

  it("rejects a code that isn't six digits before calling the API", async () => {
    const client = baseClient();
    const view = await toCodeStep(client);

    await fireEvent.changeText(view.getByLabelText("Code"), "123");
    await fireEvent.changeText(view.getByLabelText("New password"), "a good passphrase");
    await fireEvent.press(view.getByText("Set new password"));

    expect(client.resetPassword).not.toHaveBeenCalled();
    expect(await view.findByText(/six digits/i)).toBeTruthy();
  });

  it("enforces the password minimum locally", async () => {
    const client = baseClient();
    const view = await toCodeStep(client);

    await fireEvent.changeText(view.getByLabelText("Code"), "123456");
    await fireEvent.changeText(view.getByLabelText("New password"), "short");
    await fireEvent.press(view.getByText("Set new password"));

    expect(client.resetPassword).not.toHaveBeenCalled();
    expect(await view.findByText(/at least 8/i)).toBeTruthy();
  });

  it("sends the code and returns to sign-in on success", async () => {
    const client = baseClient();
    const view = await toCodeStep(client);

    await fireEvent.changeText(view.getByLabelText("Code"), "123456");
    await fireEvent.changeText(view.getByLabelText("New password"), "a good passphrase");
    await fireEvent.press(view.getByText("Set new password"));

    await waitFor(() =>
      expect(client.resetPassword).toHaveBeenCalledWith({
        email: "ada@example.com",
        code: "123456",
        password: "a good passphrase",
      }),
    );
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/login"));
  });

  it("shows the server's message when the code is refused", async () => {
    const client = baseClient();
    client.resetPassword = jest.fn(async () => {
      throw new ApiError(400, "bad_request", "That code is invalid or has expired.");
    });

    const view = await toCodeStep(client);
    await fireEvent.changeText(view.getByLabelText("Code"), "123456");
    await fireEvent.changeText(view.getByLabelText("New password"), "a good passphrase");
    await fireEvent.press(view.getByText("Set new password"));

    expect(await view.findByText(/invalid or has expired/i)).toBeTruthy();
  });
});
