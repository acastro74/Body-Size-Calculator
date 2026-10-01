import type { BodyEstimate, Profile, Sex } from "@bsc/shared";

/**
 * Rough population models for adult body dimensions (cm) from height, weight, age and sex.
 *
 * NOTE: coefficients are approximations from published anthropometric ranges, NOT a fit
 * on a dataset. Recalibrating them on ANSUR II is a known follow-up (see README).
 * Use `predictFromProfile` for expected values; the `sigma` values are residual spreads (≈1 SD).
 */

interface Model {
  intercept: number;
  perBmi: number;
  perHeight: number; // cm per cm of height difference from 175
  perAgeOver30: number;
  sigmaWithWeight: number;
  sigmaNoWeight: number;
}

const MODELS: Record<"male" | "female", Record<"chest" | "waist" | "hip", Model>> = {
  male: {
    chest: { intercept: 60, perBmi: 1.5, perHeight: 0.25, perAgeOver30: 0.08, sigmaWithWeight: 4, sigmaNoWeight: 7 },
    waist: { intercept: 21.8, perBmi: 2.6, perHeight: 0.1, perAgeOver30: 0.25, sigmaWithWeight: 5, sigmaNoWeight: 9 },
    hip: { intercept: 62, perBmi: 1.5, perHeight: 0.15, perAgeOver30: 0.05, sigmaWithWeight: 4.5, sigmaNoWeight: 7 },
  },
  female: {
    chest: { intercept: 48.4, perBmi: 1.8, perHeight: 0.2, perAgeOver30: 0.1, sigmaWithWeight: 4.5, sigmaNoWeight: 7.5 },
    waist: { intercept: 14.8, perBmi: 2.6, perHeight: 0.08, perAgeOver30: 0.2, sigmaWithWeight: 5.5, sigmaNoWeight: 9 },
    hip: { intercept: 51, perBmi: 2, perHeight: 0.1, perAgeOver30: 0.05, sigmaWithWeight: 4.5, sigmaNoWeight: 7.5 },
  },
};

/** Biacromial breadth and shoulder→wrist length as fractions of stature. */
const SHOULDER_RATIO: Record<"male" | "female", number> = { male: 0.226, female: 0.215 };
const ARM_RATIO = 0.352;
const DEFAULT_BMI: Record<"male" | "female", number> = { male: 25.5, female: 24 };

export function bmi(heightCm: number, weightKg: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export function defaultBmi(sex: Sex): number {
  return sex === "unspecified" ? (DEFAULT_BMI.male + DEFAULT_BMI.female) / 2 : DEFAULT_BMI[sex];
}

function predictOne(sex: "male" | "female", profile: Profile, key: "chest" | "waist" | "hip") {
  const m = MODELS[sex][key];
  const hasWeight = profile.weightKg != null;
  const b = hasWeight ? bmi(profile.heightCm, profile.weightKg!) : DEFAULT_BMI[sex];
  const age = profile.age ?? 30;
  const value =
    m.intercept + m.perBmi * b + m.perHeight * (profile.heightCm - 175) + m.perAgeOver30 * Math.max(0, Math.min(age, 70) - 30);
  return { value, range: hasWeight ? m.sigmaWithWeight : m.sigmaNoWeight };
}

export function predictFromProfile(profile: Profile): BodyEstimate {
  const sexes: ("male" | "female")[] = profile.sex === "unspecified" ? ["male", "female"] : [profile.sex];
  const avg = (f: (s: "male" | "female") => number) => sexes.reduce((a, s) => a + f(s), 0) / sexes.length;
  const dim = (key: "chest" | "waist" | "hip") => {
    const preds = sexes.map((s) => predictOne(s, profile, key));
    const value = preds.reduce((a, p) => a + p.value, 0) / preds.length;
    // Unspecified sex adds between-sex spread to the uncertainty.
    const spread = preds.length === 2 ? Math.abs(preds[0]!.value - preds[1]!.value) / 2 : 0;
    const range = Math.sqrt(Math.max(...preds.map((p) => p.range)) ** 2 + spread ** 2);
    return { value, range };
  };
  const h = profile.heightCm;
  return {
    chest: dim("chest"),
    waist: dim("waist"),
    hip: dim("hip"),
    shoulder: { value: avg((s) => SHOULDER_RATIO[s]) * h, range: 1.8 },
    armLength: { value: ARM_RATIO * h, range: 2.5 },
  };
}

/** Depth/width ratios of torso cross-sections (used to turn frontal widths into circumferences). */
export function depthRatio(sex: Sex, key: "chest" | "waist" | "hip", bmiValue: number): number {
  const base = {
    male: { chest: 0.68, waist: 0.68, hip: 0.66 },
    female: { chest: 0.7, waist: 0.66, hip: 0.68 },
  };
  const slope = { chest: 0.012, waist: 0.018, hip: 0.012 }[key];
  const s = sex === "unspecified" ? 0.5 * (base.male[key] + base.female[key]) : base[sex][key];
  return Math.min(0.95, Math.max(0.5, s + slope * (bmiValue - 22)));
}
