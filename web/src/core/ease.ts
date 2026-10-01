import type { FitPreference, GarmentType } from "@bsc/shared";

/**
 * Target allowances in centimetres: garment dimension minus body dimension.
 * Approximations of common pattern-making practice; tune against real data.
 */
export interface Ease {
  chest: number;
  shoulder: number;
  /** garment back length as a fraction of body height */
  lengthRatio: number;
}

const CHEST: Record<GarmentType, Record<FitPreference, number>> = {
  tshirt: { slim: 4, regular: 10, loose: 18 },
  shirt: { slim: 6, regular: 12, loose: 20 },
  sweater: { slim: 6, regular: 12, loose: 20 },
  jacket: { slim: 8, regular: 14, loose: 22 },
  hoodie: { slim: 10, regular: 16, loose: 26 },
};

const SHOULDER: Record<FitPreference, number> = { slim: 3, regular: 5.5, loose: 8 };
const SHOULDER_EXTRA: Record<GarmentType, number> = {
  tshirt: 0,
  shirt: 0,
  sweater: 0.5,
  jacket: 1,
  hoodie: 1.5,
};

const LENGTH_RATIO: Record<GarmentType, number> = {
  tshirt: 0.4,
  shirt: 0.41,
  sweater: 0.37,
  jacket: 0.4,
  hoodie: 0.38,
};
const LENGTH_FIT_DELTA: Record<FitPreference, number> = { slim: -0.01, regular: 0, loose: 0.01 };

export function getEase(garment: GarmentType, fit: FitPreference): Ease {
  return {
    chest: CHEST[garment][fit],
    shoulder: SHOULDER[fit] + SHOULDER_EXTRA[garment],
    lengthRatio: LENGTH_RATIO[garment] + LENGTH_FIT_DELTA[fit],
  };
}
