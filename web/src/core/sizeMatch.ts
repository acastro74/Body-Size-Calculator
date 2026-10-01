import type { BodyEstimate, FitPreference, GarmentType, Recommendation, SizeChart } from "@bsc/shared";
import { getEase } from "./ease";
import { normalizeChart, type NormalizedRow } from "./chart";

/** Weight of each measure in the final score, and the tolerance (cm) at which penalty = 1. */
const WEIGHTS = { chest: 1, shoulder: 0.4, sleeve: 0.3, length: 0.25 } as const;
const TOLERANCE_CM = { chest: 4, shoulder: 3.5, sleeve: 4, length: 5 } as const;
/** Being too small hurts more than being too big. */
const TOO_SMALL_FACTOR = 1.6;

function penalty(deltaCm: number, tol: number, tooSmallFactor = TOO_SMALL_FACTOR): number {
  const x = deltaCm / tol;
  return x < 0 ? tooSmallFactor * x * x : x * x;
}

/**
 * Chart sleeve lengths can be measured from the shoulder seam (~60–70 cm) or from the
 * centre back (~80+ cm). Pick the convention from the chart's own magnitude.
 */
function bodySleeveCm(body: BodyEstimate, chartSleeveCm: number): number {
  const fromShoulder = body.armLength.value;
  const fromCenterBack = fromShoulder + body.shoulder.value / 2;
  return chartSleeveCm > 72 ? fromCenterBack : fromShoulder;
}

function scoreRow(
  row: NormalizedRow,
  body: BodyEstimate,
  heightCm: number,
  ease: ReturnType<typeof getEase>,
  isGarmentChart: boolean,
  chestAllowance: number,
  offset: number,
): number {
  let total = 0;
  let weightSum = 0;
  const add = (w: number, p: number) => {
    total += w * p;
    weightSum += w;
  };
  if (row.chest != null) {
    const target = body.chest.value + offset * body.chest.range + chestAllowance;
    add(WEIGHTS.chest, penalty(row.chest - target, TOLERANCE_CM.chest));
  }
  if (row.shoulder != null && isGarmentChart) {
    const target = body.shoulder.value + offset * body.shoulder.range + ease.shoulder;
    add(WEIGHTS.shoulder, penalty(row.shoulder - target, TOLERANCE_CM.shoulder));
  }
  if (row.sleeve != null && isGarmentChart) {
    const target = bodySleeveCm(body, row.sleeve);
    add(WEIGHTS.sleeve, penalty(row.sleeve - target, TOLERANCE_CM.sleeve, 1));
  }
  if (row.length != null && isGarmentChart) {
    add(WEIGHTS.length, penalty(row.length - ease.lengthRatio * heightCm, TOLERANCE_CM.length, 1));
  }
  return weightSum === 0 ? Number.POSITIVE_INFINITY : total / weightSum;
}

/**
 * Pick the size whose dimensions best match body + target ease.
 * The score is averaged over the body estimate's uncertainty (−range, 0, +range).
 * `body` charts (chest = body size the garment fits) are matched without ease.
 */
export function recommendSize(
  chart: SizeChart,
  body: BodyEstimate,
  heightCm: number,
  garment: GarmentType,
  fit: FitPreference,
): Recommendation {
  const norm = normalizeChart(chart);
  const ease = getEase(garment, fit);
  // Unknown charts are treated as garment charts when they carry garment-only columns.
  const isGarment =
    norm.kind === "garment" ||
    (norm.kind === "unknown" && norm.rows.some((r) => r.shoulder != null || r.length != null));
  // For body charts the fit preference shifts the target instead.
  // Garment charts: target = body + ease. Body charts: the fit preference nudges the target.
  const regularChest = getEase(garment, "regular").chest;
  const chestAllowance = isGarment ? ease.chest : (ease.chest - regularChest) * 0.5;

  const ranking = norm.rows
    .map((row) => ({
      size: row.size,
      score:
        0.25 * scoreRow(row, body, heightCm, ease, isGarment, chestAllowance, -1) +
        0.5 * scoreRow(row, body, heightCm, ease, isGarment, chestAllowance, 0) +
        0.25 * scoreRow(row, body, heightCm, ease, isGarment, chestAllowance, 1),
    }))
    .filter((r) => Number.isFinite(r.score))
    .sort((a, b) => a.score - b.score);

  if (ranking.length === 0) throw new Error("size chart has no usable measurements");
  return { size: ranking[0]!.size, ranking };
}
