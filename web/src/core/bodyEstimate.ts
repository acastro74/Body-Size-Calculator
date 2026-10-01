import type { BodyEstimate, Estimate, Profile } from "@bsc/shared";
import { bmi, defaultBmi, depthRatio, predictFromProfile } from "./anthropometrics";

/**
 * Frontal measurements extracted from the photo, already scaled to centimetres.
 * Silhouette widths are flat widths of the torso (arms excluded); `null` means the
 * measurement was not reliable (e.g. arms merged with the torso).
 */
export interface FrontalMeasures {
  shoulderWidthCm: number | null;
  chestWidthCm: number | null;
  waistWidthCm: number | null;
  hipWidthCm: number | null;
  /** shoulder joint → wrist, summed over both segments, averaged over both arms */
  armLengthCm: number | null;
}

/** Ramanujan's approximation of an ellipse perimeter. */
export function ellipsePerimeter(width: number, depth: number): number {
  const a = width / 2;
  const b = depth / 2;
  const h = ((a - b) / (a + b)) ** 2;
  return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}

/** Uncertainty (cm, ≈1 SD) of a circumference derived from a single frontal silhouette. */
const PHOTO_SIGMA = { chest: 5, waist: 6, hip: 5 } as const;
/** Offset from the pose-landmark shoulder distance to the bony (biacromial) breadth. */
const SHOULDER_LANDMARK_OFFSET_CM = 2;
const ARM_OFFSET_CM = 1;

/** Inverse-variance weighted mean. */
export function fuse(a: Estimate, b: Estimate): Estimate {
  const wa = 1 / (a.range * a.range);
  const wb = 1 / (b.range * b.range);
  return { value: (a.value * wa + b.value * wb) / (wa + wb), range: Math.sqrt(1 / (wa + wb)) };
}

export function estimateBody(profile: Profile, photo: FrontalMeasures): BodyEstimate {
  const prior = predictFromProfile(profile);
  const bmiValue = profile.weightKg != null ? bmi(profile.heightCm, profile.weightKg) : defaultBmi(profile.sex);

  const fromWidth = (key: "chest" | "waist" | "hip", widthCm: number | null): Estimate => {
    if (widthCm == null) return prior[key];
    const depth = widthCm * depthRatio(profile.sex, key, bmiValue);
    const photoEstimate = { value: ellipsePerimeter(widthCm, depth), range: PHOTO_SIGMA[key] };
    return fuse(prior[key], photoEstimate);
  };

  return {
    chest: fromWidth("chest", photo.chestWidthCm),
    waist: fromWidth("waist", photo.waistWidthCm),
    hip: fromWidth("hip", photo.hipWidthCm),
    shoulder:
      photo.shoulderWidthCm != null
        ? fuse(prior.shoulder, { value: photo.shoulderWidthCm + SHOULDER_LANDMARK_OFFSET_CM, range: 2 })
        : prior.shoulder,
    armLength:
      photo.armLengthCm != null
        ? fuse(prior.armLength, { value: photo.armLengthCm + ARM_OFFSET_CM, range: 3 })
        : prior.armLength,
  };
}
