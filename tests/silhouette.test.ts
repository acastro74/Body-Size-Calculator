import { describe, expect, it } from "vitest";
import { extractFrontalMeasures, LM, type Landmark, type Mask } from "../web/src/core/silhouette";
import { assessPhoto } from "../web/src/core/photoQuality";

const W = 600;
const H = 1000;

/** Synthetic frontal person: 175 cm tall, 900 px from head top (y=50) to heels (y=950) → 5.143 px/cm. */
function synth(opts: { armsAway: boolean }) {
  const data = new Float32Array(W * H);
  const fill = (x0: number, x1: number, y: number) => {
    for (let x = Math.round(x0); x < Math.round(x1); x++) if (x >= 0 && x < W) data[y * W + x] = 1;
  };
  const cx = 300;
  for (let y = 50; y < 950; y++) {
    if (y < 160) {
      const r = 40 * Math.sqrt(Math.max(0, 1 - ((y - 105) / 55) ** 2));
      fill(cx - r, cx + r, y);
    } else if (y < 500) {
      // torso: chest 190 px wide (y≈250), waist 150 px (y≈380), hips 180 px (y≥480)
      let w;
      if (y < 250) w = 150 + ((y - 160) / 90) * 40;
      else if (y < 380) w = 190 - ((y - 250) / 130) * 40;
      else w = 150 + ((y - 380) / 100) * 30;
      fill(cx - w / 2, cx + w / 2, y);
    } else if (y < 540) {
      fill(cx - 90, cx + 90, y);
    } else {
      fill(cx - 90, cx - 5, y);
      fill(cx + 5, cx + 90, y);
    }
  }
  // arms: thick strokes from shoulder via elbow to wrist
  const stroke = (x0: number, y0: number, x1: number, y1: number, half: number) => {
    const steps = 200;
    for (let i = 0; i <= steps; i++) {
      const x = x0 + ((x1 - x0) * i) / steps;
      const y = y0 + ((y1 - y0) * i) / steps;
      fill(x - half, x + half, Math.round(y));
    }
  };
  for (const s of [-1, 1]) {
    const sx = cx + s * 100;
    const ex = cx + s * (opts.armsAway ? 150 : 60);
    const wx = cx + s * (opts.armsAway ? 190 : 60);
    stroke(sx, 190, ex, 350, 15);
    stroke(ex, 350, wx, 480, 12);
  }

  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  const set = (i: number, x: number, y: number) => (lm[i] = { x: x / W, y: y / H, visibility: 1 });
  set(LM.nose, 300, 100);
  set(LM.lShoulder, 200, 190);
  set(LM.rShoulder, 400, 190);
  set(LM.lElbow, opts.armsAway ? 150 : 240, 350);
  set(LM.rElbow, opts.armsAway ? 450 : 360, 350);
  set(LM.lWrist, opts.armsAway ? 110 : 240, 480);
  set(LM.rWrist, opts.armsAway ? 490 : 360, 480);
  set(LM.lHip, 245, 500);
  set(LM.rHip, 355, 500);
  set(LM.lAnkle, 250, 930);
  set(LM.rAnkle, 350, 930);
  set(LM.lHeel, 250, 950);
  set(LM.rHeel, 350, 950);
  const mask: Mask = { data, width: W, height: H };
  return { lm, mask };
}

describe("extractFrontalMeasures", () => {
  it("recovers torso widths from a synthetic silhouette", () => {
    const { lm, mask } = synth({ armsAway: true });
    const m = extractFrontalMeasures(lm, mask, 175)!;
    expect(m.shoulderWidthCm).toBeCloseTo(200 / 5.143, 0);
    expect(m.chestWidthCm!).toBeGreaterThan(34);
    expect(m.chestWidthCm!).toBeLessThan(38.5);
    expect(m.waistWidthCm!).toBeGreaterThan(27.5);
    expect(m.waistWidthCm!).toBeLessThan(31);
    expect(m.hipWidthCm!).toBeGreaterThan(33.5);
    expect(m.hipWidthCm!).toBeLessThan(36.5);
    expect(m.armLengthCm!).toBeGreaterThan(55);
    expect(m.armLengthCm!).toBeLessThan(68);
  });

  it("drops circumference widths when arms touch the torso", () => {
    const { lm, mask } = synth({ armsAway: false });
    const m = extractFrontalMeasures(lm, mask, 175)!;
    expect(m.chestWidthCm).toBeNull();
    expect(m.waistWidthCm).toBeNull();
    expect(m.shoulderWidthCm).not.toBeNull();
  });
});

describe("assessPhoto", () => {
  it("accepts a good frontal photo", () => {
    const { lm, mask } = synth({ armsAway: true });
    expect(assessPhoto(lm, mask)).toEqual([]);
  });
  it("warns about arms close to the body", () => {
    const { lm, mask } = synth({ armsAway: false });
    expect(assessPhoto(lm, mask).map((i) => i.code)).toEqual(["arms_close"]);
  });
  it("rejects when no person was detected", () => {
    expect(assessPhoto(undefined, undefined)[0]?.code).toBe("no_person");
  });
  it("rejects feet cut off", () => {
    const { lm, mask } = synth({ armsAway: true });
    lm[LM.lHeel] = { x: 0.4, y: 1.02, visibility: 0.2 };
    expect(assessPhoto(lm, mask)[0]?.code).toBe("not_full_body");
  });
  it("rejects a body turned sideways", () => {
    const { lm, mask } = synth({ armsAway: true });
    lm[LM.lShoulder] = { x: 0.48, y: 190 / H, visibility: 1 };
    lm[LM.rShoulder] = { x: 0.52, y: 190 / H, visibility: 1 };
    expect(assessPhoto(lm, mask).map((i) => i.code)).toContain("not_frontal");
  });
  it("rejects a tilted camera/pose", () => {
    const { lm, mask } = synth({ armsAway: true });
    lm[LM.rShoulder] = { x: 400 / W, y: 260 / H, visibility: 1 };
    expect(assessPhoto(lm, mask).map((i) => i.code)).toContain("tilted");
  });
});
