import type { SizeChart } from "@bsc/shared";

/** The TACVASEN chart from the product screenshot (garment dimensions, inches). */
export const row = (size: string, chest: number, half: number, shoulder: number, sleeve: number, hem: number, length: number) => ({
  size,
  chest,
  half_chest: half,
  shoulder,
  sleeve,
  hem,
  length,
  waist: null,
  hip: null,
});
export const TACVASEN: SizeChart = {
  unit: "in",
  kind: "garment",
  rows: [
    row("S", 42.9, 21.5, 18.7, 30.5, 39.4, 27.2),
    row("M", 45.3, 22.6, 19.5, 31.4, 41.7, 27.9),
    row("L", 48.4, 24.2, 20.3, 32.3, 44.1, 28.7),
    row("XL", 51.6, 25.8, 21.1, 33.3, 46.5, 29.5),
    row("2XL", 54.7, 27.4, 22.6, 34.2, 50.4, 30.3),
  ],
};

