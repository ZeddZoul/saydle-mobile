import { render, fireEvent } from "@testing-library/react-native";
import LanguagePicker from "../../components/LanguagePicker.jsx";
import { SUPPORTED_LOCALES } from "../../lib/i18n.js";

describe("LanguagePicker", () => {
  it("offers only languages that made it through the gate", async () => {
    const { queryByText, findByText } = await render(
      <LanguagePicker value="en" onChange={jest.fn()} />,
    );

    expect(await findByText("English")).toBeTruthy();
    expect(await findByText("Español")).toBeTruthy();
    // Not offered: no moderation rules, no curated bank.
    expect(queryByText("Français")).toBeNull();
    expect(SUPPORTED_LOCALES).not.toContain("fr");
  });

  it("names each language in that language, not in the current one", async () => {
    const { findByText } = await render(<LanguagePicker value="en" onChange={jest.fn()} />);

    // Someone looking for Spanish scans for "Español", not "Spanish".
    expect(await findByText("Español")).toBeTruthy();
  });

  it("marks the active language as selected", async () => {
    const { findByLabelText } = await render(
      <LanguagePicker value="es" onChange={jest.fn()} />,
    );

    expect((await findByLabelText("Español")).props.accessibilityState.selected).toBe(true);
    expect((await findByLabelText("English")).props.accessibilityState.selected).toBe(false);
  });

  it("reports the chosen language", async () => {
    const onChange = jest.fn();
    const { findByText } = await render(<LanguagePicker value="en" onChange={onChange} />);

    await fireEvent.press(await findByText("Español"));

    expect(onChange).toHaveBeenCalledWith("es");
  });

  it("ignores taps while a change is in flight", async () => {
    const onChange = jest.fn();
    const { findByText } = await render(
      <LanguagePicker value="en" onChange={onChange} disabled />,
    );

    await fireEvent.press(await findByText("Español"));

    expect(onChange).not.toHaveBeenCalled();
  });
});
