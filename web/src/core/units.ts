export const CM_PER_IN = 2.54;
export const KG_PER_LB = 0.45359237;

export const inToCm = (inches: number) => inches * CM_PER_IN;
export const cmToIn = (cm: number) => cm / CM_PER_IN;
export const lbToKg = (lb: number) => lb * KG_PER_LB;
export const kgToLb = (kg: number) => kg / KG_PER_LB;
export const ftInToCm = (ft: number, inches: number) => inToCm(ft * 12 + inches);

export function cmToFtIn(cm: number): { ft: number; in: number } {
  const totalIn = Math.round(cmToIn(cm) * 10) / 10;
  const ft = Math.floor(totalIn / 12);
  return { ft, in: Math.round((totalIn - ft * 12) * 10) / 10 };
}
