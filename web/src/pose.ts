import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { extractFrontalMeasures, type Landmark, type Mask } from "./core/silhouette";
import { assessPhoto, hasBlockingIssue, type PhotoIssue } from "./core/photoQuality";
import type { FrontalMeasures } from "./core/bodyEstimate";

const MAX_SIDE = 1024;
let landmarker: Promise<PoseLandmarker> | null = null;

function getLandmarker(): Promise<PoseLandmarker> {
  landmarker ??= (async () => {
    const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
    return PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: "/models/pose_landmarker_full.task", delegate: "CPU" },
      runningMode: "IMAGE",
      numPoses: 1,
      outputSegmentationMasks: true,
    });
  })().catch((err) => {
    landmarker = null;
    throw err;
  });
  return landmarker;
}

/** Decode to a canvas with EXIF rotation applied, trying several browser-supported routes. */
async function toCanvas(file: File): Promise<HTMLCanvasElement> {
  const draw = (source: CanvasImageSource, w: number, h: number) => {
    const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
  };
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const canvas = draw(bitmap, bitmap.width, bitmap.height);
    bitmap.close();
    return canvas;
  } catch {
    // Some browsers reject the options bag; <img> honours EXIF orientation by default.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return draw(img, img.naturalWidth, img.naturalHeight);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export interface PhotoAnalysis {
  issues: PhotoIssue[];
  /** null when the photo was rejected */
  measures: FrontalMeasures | null;
}

/** Runs entirely in the browser: the photo is never uploaded. */
export async function analyzePhoto(file: File, heightCm: number): Promise<PhotoAnalysis> {
  const canvas = await toCanvas(file);

  const pose = await getLandmarker();
  const result = pose.detect(canvas);
  try {
    const lm = result.landmarks[0] as Landmark[] | undefined;
    const segmentation = result.segmentationMasks?.[0];
    const mask: Mask | undefined = segmentation
      ? { data: segmentation.getAsFloat32Array(), width: segmentation.width, height: segmentation.height }
      : undefined;
    const issues = assessPhoto(lm, mask);
    if (hasBlockingIssue(issues) || !lm || !mask) return { issues, measures: null };
    return { issues, measures: extractFrontalMeasures(lm, mask, heightCm) };
  } finally {
    result.close?.();
  }
}
