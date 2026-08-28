import { render, fireEvent, act } from "@testing-library/react-native";
import StreakToast from "../../components/StreakToast.jsx";

const streak = {
  today: "2026-08-05",
  current: 3,
  longest: 5,
  seenToday: true,
  week: [
    { date: "2026-08-03", weekday: "Mon", seen: true },
    { date: "2026-08-04", weekday: "Tue", seen: true },
    { date: "2026-08-05", weekday: "Wed", seen: true },
  ],
};

describe("StreakToast", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("shows nothing until the streak actually moves", async () => {
    const { queryByTestId } = await render(
      <StreakToast streak={streak} visible={false} onHide={jest.fn()} />,
    );

    // The whole point: no permanent counter sitting on Today.
    expect(queryByTestId("streak-toast")).toBeNull();
  });

  it("shows nothing when there is no streak to report", async () => {
    const { queryByTestId } = await render(
      <StreakToast streak={null} visible onHide={jest.fn()} />,
    );

    expect(queryByTestId("streak-toast")).toBeNull();
  });

  it("appears when the day is marked read", async () => {
    const { findByTestId, findByText } = await render(
      <StreakToast streak={streak} visible onHide={jest.fn()} />,
    );

    expect(await findByTestId("streak-toast")).toBeTruthy();
    expect(await findByText("3")).toBeTruthy();
  });

  it("takes itself away without being asked", async () => {
    const onHide = jest.fn();
    await render(<StreakToast streak={streak} visible onHide={onHide} />);

    // Acknowledgement, then out of the way — it must not need dismissing.
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    expect(onHide).toHaveBeenCalled();
  });

  it("can be dismissed early with a tap", async () => {
    const onHide = jest.fn();
    const { findByTestId } = await render(
      <StreakToast streak={streak} visible onHide={onHide} />,
    );

    await fireEvent.press(await findByTestId("streak-toast-dismiss"));

    expect(onHide).toHaveBeenCalled();
  });

  it("never blocks what is underneath it", async () => {
    const { findByTestId } = await render(
      <StreakToast streak={streak} visible onHide={jest.fn()} />,
    );

    expect((await findByTestId("streak-toast")).props.pointerEvents).toBe("box-none");
  });
});
