import { render } from "@testing-library/react-native";
import PracticeWeek from "../../components/PracticeWeek.jsx";

const TODAY = "2026-08-12";
const HIDDEN = { includeHiddenElements: true };

const entry = (date, completed = true) => ({
  date,
  affirmationId: `a-${date}`,
  target: 7,
  count: 7,
  completedAt: completed ? `${date}T09:00:00.000Z` : null,
});

const filled = (view) => view.queryAllByTestId("week-dot-done", HIDDEN);

describe("PracticeWeek", () => {
  it("shows seven days, ending today", async () => {
    const view = await render(<PracticeWeek history={[]} today={TODAY} />);

    expect(view.queryAllByTestId(/week-dot/, HIDDEN)).toHaveLength(7);
  });

  it("fills only the days actually practised", async () => {
    const history = [entry("2026-08-10"), entry("2026-08-12")];
    const view = await render(<PracticeWeek history={history} today={TODAY} />);

    expect(filled(view)).toHaveLength(2);
  });

  it("ignores a day that was started but never finished", async () => {
    const view = await render(
      <PracticeWeek history={[entry("2026-08-11", false)]} today={TODAY} />,
    );

    expect(filled(view)).toHaveLength(0);
  });

  it("looks back seven days and no further", async () => {
    // 2026-08-05 is the eighth day back, so only 08-06 should count.
    const history = [entry("2026-08-05"), entry("2026-08-06")];
    const view = await render(<PracticeWeek history={history} today={TODAY} />);

    expect(filled(view)).toHaveLength(1);
  });
});
