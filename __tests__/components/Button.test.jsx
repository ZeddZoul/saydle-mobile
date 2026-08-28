import { render, screen, fireEvent } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import Button from "../../components/Button.jsx";

describe("Button", () => {
  it("renders its title and fires onPress", async () => {
    const onPress = jest.fn();
    await render(<Button title="Log in" onPress={onPress} />);

    await fireEvent.press(screen.getByText("Log in"));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("gives haptic feedback on press", async () => {
    await render(<Button title="Go" onPress={() => {}} />);

    await fireEvent.press(screen.getByText("Go"));

    expect(Haptics.impactAsync).toHaveBeenCalled();
  });

  it("shows a spinner and blocks presses while loading", async () => {
    const onPress = jest.fn();
    await render(<Button title="Save" onPress={onPress} loading />);

    // The label is replaced by the spinner.
    expect(screen.queryByText("Save")).toBeNull();

    const button = screen.getByRole("button");
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(button.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  });

  it("does not fire when disabled", async () => {
    const onPress = jest.fn();
    await render(<Button title="Nope" onPress={onPress} disabled />);

    await fireEvent.press(screen.getByText("Nope"));
    expect(onPress).not.toHaveBeenCalled();
  });
});
