import { describe, expect, it } from "vitest";
import type { SizeChart } from "@bsc/shared";
import { TACVASEN, row } from "./fixtures/charts";
import { recommendSize } from "../web/src/core/sizeMatch";
import { estimateBody, ellipsePerimeter } from "../web/src/core/bodyEstimate";
import { predictFromProfile } from "../web/src/core/anthropometrics";
import { normalizeChart, validateChart } from "../web/src/core/chart";
import { cmToFtIn, ftInToCm, inToCm } from "../web/src/core/units";

const exactBody = (chestCm: number, heightCm: number) => ({
  chest: { value: chestCm, range: 0 },
  waist: { value: chestCm - 15, range: 0 },
  hip: { value: chestCm, range: 0 },
  shoulder: { value: 0.226 * heightCm, range: 0 },
  armLength: { value: 0.352 * heightCm, range: 0 },
});

describe("units", () => {
  it("converts", () => {
    expect(inToCm(10)).toBeCloseTo(25.4);
    expect(ftInToCm(5, 9)).toBeCloseTo(175.26, 1);
    expect(cmToFtIn(175.26)).toEqual({ ft: 5, in: 9 });
  });
});

describe("chart", () => {
  it("normalizes inches to cm", () => {
    const n = normalizeChart(TACVASEN);
    expect(n.rows[0]!.chest).toBeCloseTo(inToCm(42.9));
  });
  it("derives chest from half chest", () => {
    const n = normalizeChart({ unit: "cm", kind: "garment", rows: [{ ...row("M", 0, 50, 0, 0, 0, 0), chest: null }] });
    expect(n.rows[0]!.chest).toBe(100);
  });
  it("accepts the sample chart and flags a broken one", () => {
    expect(validateChart(TACVASEN)).toEqual([]);
    const broken = { ...TACVASEN, rows: [TACVASEN.rows[1]!, TACVASEN.rows[0]!] };
    expect(validateChart(broken).map((i) => i.code)).toContain("non_monotonic_chest");
  });
});

describe("recommendSize (TACVASEN jacket, 175 cm, chest ~100 cm)", () => {
  const body = exactBody(100, 175);
  it("regular → M", () => expect(recommendSize(TACVASEN, body, 175, "jacket", "regular").size).toBe("M"));
  it("slim → S", () => expect(recommendSize(TACVASEN, body, 175, "jacket", "slim").size).toBe("S"));
  it("loose → L", () => expect(recommendSize(TACVASEN, body, 175, "jacket", "loose").size).toBe("L"));
  it("bigger body → bigger size", () => {
    expect(recommendSize(TACVASEN, exactBody(116, 180), 180, "jacket", "regular").size).toBe("XL");
  });
});

describe("body charts", () => {
  const bodyChart: SizeChart = {
    unit: "cm",
    kind: "body",
    rows: ["S", "M", "L"].map((size, i) => ({ ...row(size, 92 + i * 8, 0, 0, 0, 0, 0), half_chest: null, shoulder: null, sleeve: null, length: null, hem: null })),
  };
  it("matches chest without adding ease", () => {
    expect(recommendSize(bodyChart, exactBody(100, 175), 175, "tshirt", "regular").size).toBe("M");
  });
});

describe("body estimation", () => {
  it("ellipse perimeter reduces to circle", () => {
    expect(ellipsePerimeter(20, 20)).toBeCloseTo(Math.PI * 20, 3);
  });
  it("prior grows with weight and has wider range without it", () => {
    const light = predictFromProfile({ heightCm: 175, weightKg: 65, age: 30, sex: "male" });
    const heavy = predictFromProfile({ heightCm: 175, weightKg: 95, age: 30, sex: "male" });
    const none = predictFromProfile({ heightCm: 175, age: 30, sex: "male" });
    expect(heavy.chest.value).toBeGreaterThan(light.chest.value);
    expect(none.chest.range).toBeGreaterThan(light.chest.range);
  });
  it("photo measurement narrows the range and moves the estimate toward it", () => {
    const profile = { heightCm: 175, weightKg: 80, sex: "male" as const };
    const prior = predictFromProfile(profile);
    const est = estimateBody(profile, { shoulderWidthCm: 38, chestWidthCm: 38, waistWidthCm: 32, hipWidthCm: 35, armLengthCm: 60 });
    expect(est.chest.range).toBeLessThan(prior.chest.range);
    const photoChest = ellipsePerimeter(38, 38 * 0.68 + 0.012 * 38 * (80 / 1.75 ** 2 - 22));
    expect(Math.abs(est.chest.value - photoChest)).toBeLessThan(Math.abs(prior.chest.value - photoChest));
  });
  it("falls back to the prior when the photo is unusable", () => {
    const profile = { heightCm: 175, weightKg: 80, sex: "female" as const };
    const est = estimateBody(profile, { shoulderWidthCm: null, chestWidthCm: null, waistWidthCm: null, hipWidthCm: null, armLengthCm: null });
    expect(est).toEqual(predictFromProfile(profile));
  });
});
