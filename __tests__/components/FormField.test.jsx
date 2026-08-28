import { render, screen, fireEvent } from "@testing-library/react-native";
import FormField from "../../components/FormField.jsx";

describe("FormField", () => {
  it("renders its label and forwards typing", async () => {
    const onChangeText = jest.fn();
    await render(
      <FormField label="Email" placeholder="you@example.com" onChangeText={onChangeText} />,
    );

    await fireEvent.changeText(screen.getByLabelText("Email"), "ada@example.com");
    expect(onChangeText).toHaveBeenCalledWith("ada@example.com");
  });

  it("shows an inline error and marks the field invalid", async () => {
    await render(<FormField label="Email" error="Enter a valid email address." />);

    expect(screen.getByText("Enter a valid email address.")).toBeTruthy();
    expect(screen.getByLabelText("Email").props.accessibilityInvalid).toBe(true);
  });

  it("masks a password until the reveal toggle is pressed", async () => {
    await render(<FormField label="Password" secureTextEntry />);

    const input = screen.getByLabelText("Password");
    expect(input.props.secureTextEntry).toBe(true);

    await fireEvent.press(screen.getByLabelText("Show password"));
    expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(false);

    await fireEvent.press(screen.getByLabelText("Hide password"));
    expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(true);
  });

  it("has no reveal toggle for a normal field", async () => {
    await render(<FormField label="Name" />);
    expect(screen.queryByLabelText("Show password")).toBeNull();
  });
});
