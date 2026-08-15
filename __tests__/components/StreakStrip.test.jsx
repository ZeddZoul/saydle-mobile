import { render } from "@testing-library/react-native";
import StreakStrip from "../../components/StreakStrip.jsx";

const week = (seenDates = []) =>
  [
    "2026-08-03",
    "2026-08-04",
    "2026-08-05",
    "2026-08-06",
    "2026-08-07",
    "2026-08-08",
    "2026-08-09",
  ].map((date) => ({
    date,
    seen: seenDates.includes(date),
    isToday: date === "2026-08-04",
    isFuture: date > "2026-08-04",
  }));

describe("StreakStrip", () => {
  it("renders nothing until the streak has loaded", async () => {
    const view = await render(<StreakStrip streak={null} />);
    expect(view.toJSON()).toBeNull();
  });

  it("invites a first day instead of showing a bare zero", async () => {
    const view = await render(<StreakStrip streak={{ current: 0, week: week() }} />);

    expect(await view.findByText("Start your streak today")).toBeTruthy();
    expect(view.queryByText("0")).toBeNull();
  });

  it("shows the count with singular wording on day one", async () => {
    const view = await render(
      <StreakStrip streak={{ current: 1, week: week(["2026-08-04"]) }} />,
    );

    expect(await view.findByText("1")).toBeTruthy();
    expect(view.getByText("day in a row")).toBeTruthy();
  });

  it("pluralises beyond day one", async () => {
    const view = await render(
      <StreakStrip streak={{ current: 4, week: week(["2026-08-03", "2026-08-04"]) }} />,
    );

    expect(await view.findByText("4")).toBeTruthy();
    expect(view.getByText("days in a row")).toBeTruthy();
  });

  it("marks completed days for screen readers", async () => {
    const view = await render(
      <StreakStrip streak={{ current: 1, week: week(["2026-08-03"]) }} />,
    );

    // Monday was read; Tuesday (today) has not been.
    expect(await view.findByLabelText(/Mon, complete/)).toBeTruthy();
    expect(view.queryByLabelText(/Tue, complete/)).toBeNull();
  });
});
