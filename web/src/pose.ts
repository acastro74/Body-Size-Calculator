import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { extractFrontalMeasures, type Landmark, type Mask } from "./core/silhouette";
import { assessPhoto, hasBlockingIssue, type PhotoIssue } from "./core/photoQuality";
import type { FrontalMeasures } from "./core/bodyEstimate";

const MAX_SIDE = 1024;
const MODEL_URL = "/models/pose_landmarker_full.task";
const WASM_URL = "/mediapipe/wasm";
const MIN_MODEL_BYTES = 5_000_000;

/** An error that says which stage failed (model download, engine start, detection, …). */
export class PoseError extends Error {
  constructor(public stage: string, cause: unknown) {
    super(`[${stage}] ${cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause)}`);
    this.name = "PoseError";
  }
}

type Delegate = "CPU" | "GPU";
let cached: { delegate: Delegate; instance: Promise<PoseLandmarker> } | null = null;

async function loadModel(): Promise<Uint8Array> {
  const res = await fetch(MODEL_URL);
  const type = res.headers.get("content-type") ?? "";
  // A missing file is served as index.html by the dev server's SPA fallback; don't feed that to the engine.
  if (!res.ok || type.includes("html")) throw new Error(`model file not served (HTTP ${res.status}, ${type || "no type"})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length < MIN_MODEL_BYTES) throw new Error(`model file looks truncated (${bytes.length} bytes); delete web/public/models and re-run npm run dev`);
  return bytes;
}

async function createLandmarker(delegate: Delegate): Promise<PoseLandmarker> {
  let model: Uint8Array;
  try {
    model = await loadModel();
  } catch (e) {
    throw new PoseError("model", e);
  }
  try {
    const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
    return await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: model, delegate },
      runningMode: "IMAGE",
      numPoses: 1,
      outputSegmentationMasks: true,
    });
  } catch (e) {
    throw new PoseError(`engine-start/${delegate}`, e);
  }
}

function getLandmarker(delegate: Delegate): Promise<PoseLandmarker> {
  if (cached?.delegate !== delegate) cached = { delegate, instance: createLandmarker(delegate) };
  const { instance } = cached;
  // Never keep a failed instance: the WASM runtime cannot be reused after an abort.
  instance.catch(() => {
    if (cached?.instance === instance) cached = null;
  });
  return instance;
}

function discard(delegate: Delegate) {
  if (cached?.delegate === delegate) {
    cached.instance.then((p) => p.close()).catch(() => {});
    cached = null;
  }
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

  // Try the CPU engine first, then the GPU one; the WASM runtime can abort on some browser/GPU setups.
  const errors: string[] = [];
  for (const delegate of ["CPU", "GPU"] as const) {
    try {
      const pose = await getLandmarker(delegate);
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
    } catch (e) {
      const err = e instanceof PoseError ? e : new PoseError(`detect/${delegate}`, e);
      errors.push(err.message);
      discard(delegate);
      // A missing/corrupt model fails the same way on every delegate.
      if (err.stage === "model") break;
    }
  }
  throw new Error(errors.join("\n"));
}
