import { render } from "@testing-library/react-native";
import CompletenessMeter from "../../components/CompletenessMeter.jsx";

describe("CompletenessMeter", () => {
  it("reports its value to assistive tech, not just visually", async () => {
    const { findByRole } = await render(<CompletenessMeter percent={40} />);
    const bar = await findByRole("progressbar");

    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 40 });
  });

  it("clamps a negative percent to empty", async () => {
    const { findByRole } = await render(<CompletenessMeter percent={-20} />);
    expect((await findByRole("progressbar")).props.accessibilityValue.now).toBe(0);
  });

  it("clamps an over-100 percent to full", async () => {
    const { findByRole } = await render(<CompletenessMeter percent={140} />);
    expect((await findByRole("progressbar")).props.accessibilityValue.now).toBe(100);
  });

  it("shows a label only when given one", async () => {
    const { findByText } = await render(
      <CompletenessMeter percent={40} label="40% personalized" />,
    );
    expect(await findByText("40% personalized")).toBeTruthy();
  });
});
