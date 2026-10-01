import { armsAway, geometry, LM, type Landmark, type Mask } from "./silhouette";

export type PhotoIssueCode =
  | "no_person"
  | "not_full_body"
  | "too_small"
  | "not_frontal"
  | "tilted"
  | "arms_close";

export interface PhotoIssue {
  code: PhotoIssueCode;
  /** blocking issues stop the analysis; warnings only reduce accuracy */
  severity: "error" | "warning";
}

const REQUIRED = [LM.nose, LM.lShoulder, LM.rShoulder, LM.lHip, LM.rHip, LM.lAnkle, LM.rAnkle, LM.lHeel, LM.rHeel];
const VISIBLE = 0.5;

/** Check that the photo is usable for estimation. Pure: operates on landmarks + mask. */
export function assessPhoto(lm: Landmark[] | undefined, mask: Mask | undefined): PhotoIssue[] {
  if (!lm || lm.length < 33 || !mask) return [{ code: "no_person", severity: "error" }];

  const issues: PhotoIssue[] = [];
  const g = geometry(lm, mask);
  const visible = REQUIRED.every((i) => (lm[i]?.visibility ?? 0) > VISIBLE);
  const inside = REQUIRED.every((i) => {
    const l = lm[i]!;
    return l.x > 0.01 && l.x < 0.99 && l.y > 0.005 && l.y < 0.995;
  });
  if (!g || !visible || !inside || g.headTopY < 2) return [{ code: "not_full_body", severity: "error" }];

  if (g.bodyHeightPx < 0.6 * g.height) issues.push({ code: "too_small", severity: "warning" });

  const ls = lm[LM.lShoulder]!;
  const rs = lm[LM.rShoulder]!;
  const shoulderPx = Math.hypot((ls.x - rs.x) * g.width, (ls.y - rs.y) * g.height);
  // Facing the camera, shoulder-joint distance is ≈ 0.19–0.21 of height; turned bodies shrink it.
  if (shoulderPx / g.bodyHeightPx < 0.14) issues.push({ code: "not_frontal", severity: "error" });

  const tilt = Math.abs((ls.y - rs.y) * g.height) / Math.max(shoulderPx, 1);
  if (tilt > 0.15) issues.push({ code: "tilted", severity: "error" });

  if (!armsAway(lm, g)) issues.push({ code: "arms_close", severity: "warning" });
  return issues;
}

export const hasBlockingIssue = (issues: PhotoIssue[]) => issues.some((i) => i.severity === "error");
