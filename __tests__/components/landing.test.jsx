import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Home from "../../app/index.jsx";
import Sparkles from "../../components/Sparkles.jsx";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: (...a) => mockPush(...a), replace: jest.fn() }),
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderHome = () =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <Home />
    </SafeAreaProvider>,
  );

beforeEach(() => mockPush.mockClear());

/**
 * The landing screen, without the placeholders.
 *
 * "Loved by early users", five stars and a carousel of invented quotes were
 * social proof nobody could stand behind. The screen now says what the product
 * is, and links the documents that describe what signing up agrees to.
 */
describe("Landing", () => {
  it("describes the product honestly instead of claiming a rating", async () => {
    const { findByText, queryByText, queryByLabelText } = await renderHome();

    expect(await findByText(/One affirmation a day, free to read/)).toBeTruthy();
    expect(queryByText(/Loved by early users/)).toBeNull();
    expect(queryByLabelText(/five stars/i)).toBeNull();
    expect(queryByText(/gentlest part of my morning/)).toBeNull();
  });

  it("opens the two doors", async () => {
    const { findByText } = await renderHome();

    await fireEvent.press(await findByText("Get started"));
    await fireEvent.press(await findByText("I already have an account"));

    expect(mockPush).toHaveBeenNthCalledWith(1, "/onboarding");
    expect(mockPush).toHaveBeenNthCalledWith(2, "/login");
  });

  it("links the Privacy Policy and Terms before an account exists", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    const { findByTestId } = await renderHome();

    await fireEvent.press(await findByTestId("legal-privacy"));
    await fireEvent.press(await findByTestId("legal-terms"));

    await waitFor(() => expect(openURL).toHaveBeenCalledTimes(2));
    expect(openURL.mock.calls[0][0]).toBe("https://saydle.app/privacy");
    expect(openURL.mock.calls[1][0]).toBe("https://saydle.app/terms");
    openURL.mockRestore();
  });
});

describe("Sparkles", () => {
  it("mounts without crashing", async () => {
    // Pure decoration — this just guards against a broken import or animation setup.
    await render(<Sparkles />);
  });
});
