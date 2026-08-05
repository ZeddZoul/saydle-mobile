import { Component } from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { Text, Pressable } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ToastProvider, useToast } from "../../contexts/ToastContext.jsx";

// Catches a render-time throw so we can assert on its message.
class Boundary extends Component {
  state = { message: null };
  static getDerivedStateFromError(error) {
    return { message: error.message };
  }
  render() {
    return this.state.message ? <Text>{this.state.message}</Text> : this.props.children;
  }
}

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

// A probe that triggers a toast from a button press.
const Probe = ({ variant, message }) => {
  const toast = useToast();
  return (
    <Pressable onPress={() => toast[variant](message)}>
      <Text>fire</Text>
    </Pressable>
  );
};

const renderWithToast = (ui) =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ToastProvider>{ui}</ToastProvider>
    </SafeAreaProvider>,
  );

describe("ToastProvider", () => {
  it("shows nothing until a toast is fired", async () => {
    await renderWithToast(<Probe variant="success" message="Saved" />);
    expect(screen.queryByText("Saved")).toBeNull();
  });

  it("renders a success message when fired", async () => {
    await renderWithToast(<Probe variant="success" message="Preferences saved" />);

    await fireEvent.press(screen.getByText("fire"));

    expect(screen.getByText("Preferences saved")).toBeTruthy();
  });

  it("renders an error message when fired", async () => {
    await renderWithToast(<Probe variant="error" message="Could not reach Saydle." />);

    await fireEvent.press(screen.getByText("fire"));

    expect(screen.getByText("Could not reach Saydle.")).toBeTruthy();
  });

  it("throws if used outside a provider", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});

    await render(
      <Boundary>
        <Probe variant="info" message="x" />
      </Boundary>,
    );

    expect(screen.getByText(/ToastProvider/)).toBeTruthy();
    spy.mockRestore();
  });
});
