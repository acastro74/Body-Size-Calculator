// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChartScreen } from "../web/src/screens/ChartScreen";
import { ResultScreen } from "../web/src/screens/ResultScreen";
import { TACVASEN } from "./fixtures/charts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ResultScreen", () => {
  it("shows a recommended size and estimated measures from profile alone", () => {
    render(
      <ResultScreen
        lang="en"
        units="imperial"
        profile={{ heightCm: 175, weightKg: 75, age: 30, sex: "male" }}
        photo={null}
        selection={{ chart: TACVASEN, garment: "jacket", fit: "regular" }}
        onAnotherChart={() => {}}
        onStartOver={() => {}}
      />,
    );
    expect(["S", "M", "L", "XL", "2XL"]).toContain(screen.getByTestId("size").textContent);
    expect(screen.getByText("Chest")).toBeTruthy();
    expect(screen.getByText(/Approximate estimate/)).toBeTruthy();
  });

  it("fit preference moves the recommendation monotonically", () => {
    const sizes = (["slim", "regular", "loose"] as const).map((fit) => {
      const { unmount } = render(
        <ResultScreen lang="en" units="metric" profile={{ heightCm: 175, weightKg: 75, sex: "male" }} photo={null}
          selection={{ chart: TACVASEN, garment: "jacket", fit }} onAnotherChart={() => {}} onStartOver={() => {}} />,
      );
      const s = screen.getByTestId("size").textContent!;
      unmount();
      return ["S", "M", "L", "XL", "2XL"].indexOf(s);
    });
    expect(sizes[0]!).toBeLessThanOrEqual(sizes[1]!);
    expect(sizes[1]!).toBeLessThanOrEqual(sizes[2]!);
  });
});

describe("ChartScreen", () => {
  it("reads pasted text through the API, lets the user edit, and returns the selection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ chart: TACVASEN }), { status: 200 })));
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<ChartScreen lang="en" units="metric" initial={null} onBack={() => {}} onDone={onDone} />);

    expect((screen.getByRole("button", { name: "Calculate my size" }) as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByLabelText("Or paste the chart text"), "S 42.9 21.5 ...");
    await user.click(screen.getByRole("button", { name: "Read chart" }));
    await waitFor(() => expect(screen.getByLabelText("M chest")).toBeTruthy());

    const cell = screen.getByLabelText("M chest") as HTMLInputElement;
    await user.clear(cell);
    await user.type(cell, "45.5");
    await user.selectOptions(screen.getByLabelText("Preferred fit"), "slim");
    await user.click(screen.getByRole("button", { name: "Calculate my size" }));

    const sel = onDone.mock.calls[0]![0];
    expect(sel.fit).toBe("slim");
    expect(sel.chart.rows.find((r: { size: string }) => r.size === "M").chest).toBe(45.5);
  });

  it("shows a friendly error when no chart is found", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "no_chart" }), { status: 422 })));
    const user = userEvent.setup();
    render(<ChartScreen lang="en" units="metric" initial={null} onBack={() => {}} onDone={() => {}} />);
    await user.type(screen.getByLabelText("Or paste the chart text"), "hello");
    await user.click(screen.getByRole("button", { name: "Read chart" }));
    expect((await screen.findByRole("alert")).textContent).toContain("couldn't find a size chart");
  });
});
