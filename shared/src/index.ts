import { z } from "zod";

export const FIT_PREFERENCES = ["slim", "regular", "loose"] as const;
export const GARMENT_TYPES = ["tshirt", "shirt", "jacket", "hoodie", "sweater"] as const;
export const SEXES = ["male", "female", "unspecified"] as const;

export type FitPreference = (typeof FIT_PREFERENCES)[number];
export type GarmentType = (typeof GARMENT_TYPES)[number];
export type Sex = (typeof SEXES)[number];

export interface Profile {
  heightCm: number;
  weightKg?: number;
  age?: number;
  sex: Sex;
}

/** One row of a size chart. Every measure is optional (null when the chart lacks the column). */
export const ChartRowSchema = z.object({
  size: z.string(),
  chest: z.number().nullable(),
  half_chest: z.number().nullable(),
  shoulder: z.number().nullable(),
  sleeve: z.number().nullable(),
  hem: z.number().nullable(),
  length: z.number().nullable(),
  waist: z.number().nullable(),
  hip: z.number().nullable(),
});
export type ChartRow = z.infer<typeof ChartRowSchema>;

export const CHART_MEASURES = [
  "chest",
  "half_chest",
  "shoulder",
  "sleeve",
  "hem",
  "length",
  "waist",
  "hip",
] as const;
export type ChartMeasure = (typeof CHART_MEASURES)[number];

export const SizeChartSchema = z.object({
  /** Unit used by every number in the chart. */
  unit: z.enum(["in", "cm"]),
  /** `garment`: dimensions of the product. `body`: body dimensions the size fits. */
  kind: z.enum(["garment", "body", "unknown"]),
  rows: z.array(ChartRowSchema),
});
export type SizeChart = z.infer<typeof SizeChartSchema>;

export type BodyMeasure = "chest" | "waist" | "hip" | "shoulder" | "armLength";

export interface Estimate {
  /** centimetres */
  value: number;
  /** ± centimetres (roughly one standard deviation) */
  range: number;
}
export type BodyEstimate = Record<BodyMeasure, Estimate>;

export interface SizeScore {
  size: string;
  score: number;
}
export interface Recommendation {
  size: string;
  ranking: SizeScore[];
}

export const ParseChartRequestSchema = z.union([
  z.object({ text: z.string().min(1).max(20000) }),
  z.object({
    imageBase64: z.string().min(1),
    mediaType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
  }),
]);
export type ParseChartRequest = z.infer<typeof ParseChartRequestSchema>;
