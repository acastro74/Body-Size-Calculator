import type { SizeChart } from "@bsc/shared";
import { inToCm } from "./units";

/** A chart with all dimensions in centimetres and `chest` always filled when derivable. */
export interface NormalizedRow {
  size: string;
  chest?: number;
  shoulder?: number;
  sleeve?: number;
  length?: number;
}
export interface NormalizedChart {
  kind: SizeChart["kind"];
  rows: NormalizedRow[];
}

export function normalizeChart(chart: SizeChart): NormalizedChart {
  const k = chart.unit === "in" ? inToCm(1) : 1;
  const conv = (v: number | null): number | undefined => (v == null ? undefined : v * k);
  const rows = chart.rows.map((r) => {
    const chest = conv(r.chest) ?? (r.half_chest != null ? conv(r.half_chest)! * 2 : undefined);
    return {
      size: r.size,
      chest,
      shoulder: conv(r.shoulder),
      sleeve: conv(r.sleeve),
      length: conv(r.length),
    };
  });
  return { kind: chart.kind, rows };
}

export interface ChartIssue {
  code: "no_chest" | "non_monotonic_chest" | "half_chest_mismatch" | "few_rows";
  size?: string;
}

/** Sanity checks surfaced to the user next to the editable table. */
export function validateChart(chart: SizeChart): ChartIssue[] {
  const issues: ChartIssue[] = [];
  if (chart.rows.length < 2) issues.push({ code: "few_rows" });
  if (!chart.rows.some((r) => r.chest != null || r.half_chest != null)) {
    issues.push({ code: "no_chest" });
  }
  for (const r of chart.rows) {
    if (r.chest != null && r.half_chest != null && Math.abs(r.chest - 2 * r.half_chest) > 0.06 * r.chest) {
      issues.push({ code: "half_chest_mismatch", size: r.size });
    }
  }
  const chests = normalizeChart(chart).rows.map((r) => r.chest);
  for (let i = 1; i < chests.length; i++) {
    const a = chests[i - 1];
    const b = chests[i];
    if (a != null && b != null && b < a) {
      issues.push({ code: "non_monotonic_chest", size: chart.rows[i]!.size });
    }
  }
  return issues;
}
