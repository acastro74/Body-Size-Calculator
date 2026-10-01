import type { FrontalMeasures } from "./bodyEstimate";

export interface Landmark {
  x: number; // normalized 0..1
  y: number;
  visibility?: number;
}
export interface Mask {
  /** foreground confidence (0..1) per pixel, row-major */
  data: ArrayLike<number>;
  width: number;
  height: number;
}

/** MediaPipe pose landmark indices. */
export const LM = {
  nose: 0,
  lShoulder: 11,
  rShoulder: 12,
  lElbow: 13,
  rElbow: 14,
  lWrist: 15,
  rWrist: 16,
  lHip: 23,
  rHip: 24,
  lAnkle: 27,
  rAnkle: 28,
  lHeel: 29,
  rHeel: 30,
} as const;

const FG = 0.5;

export interface Geometry {
  width: number;
  height: number;
  headTopY: number;
  groundY: number;
  bodyHeightPx: number;
  pxPerCm: (heightCm: number) => number;
}

const px = (l: Landmark, w: number, h: number) => ({ x: l.x * w, y: l.y * h });
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

const isFg = (m: Mask, x: number, y: number) => (m.data[y * m.width + x] ?? 0) > FG;

/** First row (from the top) holding a meaningful number of foreground pixels. */
function topRow(m: Mask, minPixels = 4): number | null {
  for (let y = 0; y < m.height; y++) {
    let n = 0;
    for (let x = 0; x < m.width; x++) if (isFg(m, x, y) && ++n >= minPixels) return y;
  }
  return null;
}

/** Extent of the connected foreground run on row `y` that contains (or is near) column `cx`. */
export function runAt(m: Mask, y: number, cx: number, search = 20): [number, number] | null {
  const yy = Math.min(m.height - 1, Math.max(0, Math.round(y)));
  let x = Math.min(m.width - 1, Math.max(0, Math.round(cx)));
  if (!isFg(m, x, yy)) {
    let found = -1;
    for (let d = 1; d <= search && found < 0; d++) {
      if (x - d >= 0 && isFg(m, x - d, yy)) found = x - d;
      else if (x + d < m.width && isFg(m, x + d, yy)) found = x + d;
    }
    if (found < 0) return null;
    x = found;
  }
  let l = x;
  while (l > 0 && isFg(m, l - 1, yy)) l--;
  let r = x;
  while (r < m.width - 1 && isFg(m, r + 1, yy)) r++;
  return [l, r + 1];
}

export function geometry(lm: Landmark[], m: Mask): Geometry | null {
  const headTopY = topRow(m);
  const heels = [lm[LM.lHeel], lm[LM.rHeel]].filter((l): l is Landmark => !!l);
  if (headTopY == null || heels.length === 0) return null;
  const groundY = (heels.reduce((a, l) => a + l.y, 0) / heels.length) * m.height;
  const bodyHeightPx = groundY - headTopY;
  if (bodyHeightPx <= 0) return null;
  return { width: m.width, height: m.height, headTopY, groundY, bodyHeightPx, pxPerCm: (h) => bodyHeightPx / h };
}

/** True when both arms are held away from the torso so silhouette widths are torso-only. */
export function armsAway(lm: Landmark[], g: Geometry): boolean {
  const gap = 0.05 * g.bodyHeightPx;
  const side = (wrist: number, elbow: number, hip: number) => {
    const w = lm[wrist];
    const e = lm[elbow];
    const h = lm[hip];
    if (!w || !e || !h) return false;
    return Math.abs(w.x - h.x) * g.width > gap && Math.abs(e.x - h.x) * g.width > gap * 0.5;
  };
  return side(LM.lWrist, LM.lElbow, LM.lHip) && side(LM.rWrist, LM.rElbow, LM.rHip);
}

/**
 * x of an arm's centre line (shoulder→elbow→wrist) at image row `y`, or null if the row is
 * outside the arm's vertical extent.
 */
function armCenterX(lm: Landmark[], g: Geometry, ids: [number, number, number], y: number): number | null {
  const pts = ids.map((i) => lm[i]).filter((l): l is Landmark => !!l).map((l) => px(l, g.width, g.height));
  if (pts.length < 3) return null;
  // Extend past the wrist to cover the hand, which the pose model does not track as a joint.
  const [elbow, wrist] = [pts[1]!, pts[2]!];
  pts.push({ x: wrist.x + 0.45 * (wrist.x - elbow.x), y: wrist.y + 0.45 * (wrist.y - elbow.y) });
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const [lo, hi] = a.y <= b.y ? [a, b] : [b, a];
    if (y >= lo.y && y <= hi.y && hi.y > lo.y) return lo.x + ((hi.x - lo.x) * (y - lo.y)) / (hi.y - lo.y);
  }
  return null;
}

const ARM_L: [number, number, number] = [LM.lShoulder, LM.lElbow, LM.lWrist];
const ARM_R: [number, number, number] = [LM.rShoulder, LM.rElbow, LM.rWrist];

/**
 * True when an arm's centre line lies inside the torso run on this row: the silhouette
 * then includes the arm, so its width is not a torso width.
 */
export function armMergedAtRow(lm: Landmark[], g: Geometry, y: number, run: [number, number]): boolean {
  const margin = 0.01 * g.bodyHeightPx;
  return [ARM_L, ARM_R].some((ids) => {
    const x = armCenterX(lm, g, ids, y);
    return x != null && x > run[0] + margin && x < run[1] - margin;
  });
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

export function extractFrontalMeasures(lm: Landmark[], m: Mask, heightCm: number): FrontalMeasures | null {
  const g = geometry(lm, m);
  if (!g) return null;
  const ls = lm[LM.lShoulder];
  const rs = lm[LM.rShoulder];
  const lh = lm[LM.lHip];
  const rh = lm[LM.rHip];
  if (!ls || !rs || !lh || !rh) return null;

  const scale = g.pxPerCm(heightCm);
  const S = mid(px(ls, g.width, g.height), px(rs, g.width, g.height));
  const H = mid(px(lh, g.width, g.height), px(rh, g.width, g.height));
  const torso = H.y - S.y;
  const cx = (S.x + H.x) / 2;

  /** Torso-only widths over a band of rows; rows where an arm merges with the torso are skipped. */
  const collect = (from: number, to: number, steps = 7) => {
    const out: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const y = S.y + torso * (from + ((to - from) * i) / steps);
      const r = runAt(m, y, cx);
      if (r && !armMergedAtRow(lm, g, y, r)) out.push((r[1] - r[0]) / scale);
    }
    return out;
  };

  const chestW = collect(0.2, 0.3);
  const waistW = collect(0.5, 0.8);
  const hipW = collect(1.0, 1.15);

  const arm = (s: number, e: number, w: number) => {
    const a = lm[s];
    const b = lm[e];
    const c = lm[w];
    if (!a || !b || !c) return null;
    const [pa, pb, pc] = [px(a, g.width, g.height), px(b, g.width, g.height), px(c, g.width, g.height)];
    return (dist(pa, pb) + dist(pb, pc)) / scale;
  };
  const arms = [arm(LM.lShoulder, LM.lElbow, LM.lWrist), arm(LM.rShoulder, LM.rElbow, LM.rWrist)].filter(
    (v): v is number => v != null,
  );

  return {
    shoulderWidthCm: dist(px(ls, g.width, g.height), px(rs, g.width, g.height)) / scale,
    chestWidthCm: chestW.length ? median(chestW) : null,
    waistWidthCm: waistW.length ? Math.min(...waistW) : null,
    hipWidthCm: hipW.length ? Math.max(...hipW) : null,
    armLengthCm: arms.length ? arms.reduce((a, v) => a + v, 0) / arms.length : null,
  };
}

/** True when the arms merge with the torso silhouette across the whole chest band. */
export function chestMerged(lm: Landmark[], m: Mask): boolean {
  const g = geometry(lm, m);
  const ls = lm[LM.lShoulder];
  const rs = lm[LM.rShoulder];
  const lh = lm[LM.lHip];
  const rh = lm[LM.rHip];
  if (!g || !ls || !rs || !lh || !rh) return false;
  const S = mid(px(ls, g.width, g.height), px(rs, g.width, g.height));
  const H = mid(px(lh, g.width, g.height), px(rh, g.width, g.height));
  const cx = (S.x + H.x) / 2;
  let clear = 0;
  for (let i = 0; i <= 6; i++) {
    const y = S.y + (H.y - S.y) * (0.2 + (0.1 * i) / 6);
    const r = runAt(m, y, cx);
    if (r && !armMergedAtRow(lm, g, y, r)) clear++;
  }
  return clear === 0;
}
