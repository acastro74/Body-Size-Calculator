import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { extractFrontalMeasures, extractLandmarkMeasures, type Landmark, type Mask } from "./core/silhouette";
import { assessPhoto, hasBlockingIssue, type PhotoIssue } from "./core/photoQuality";
import type { FrontalMeasures } from "./core/bodyEstimate";

const MAX_SIDE = 1024;
// The WASM runtime prints the real reason for an abort to the console; keep the latest lines for error reports.
const consoleTail: string[] = [];
for (const level of ["warn", "error"] as const) {
  const orig = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    consoleTail.push(`${level}: ${args.map(String).join(" ").slice(0, 240)}`);
    if (consoleTail.length > 8) consoleTail.shift();
    orig(...args);
  };
}

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

/** Starting the engine can hang on some GPU/browser setups; fail fast instead of spinning forever. */
export const START_TIMEOUT_MS = { CPU: 30_000, GPU: 15_000 } as const;

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${Math.round(ms / 1000)}s`)), ms);
  });
  return Promise.race([promise, timeout]).catch((e) => {
    throw new PoseError(label, e);
  }).finally(() => clearTimeout(timer));
}

type Delegate = "CPU" | "GPU";
let cached: { key: string; delegate: Delegate; masks: boolean; instance: Promise<PoseLandmarker> } | null = null;

async function loadModel(): Promise<Uint8Array> {
  const res = await fetch(MODEL_URL);
  const type = res.headers.get("content-type") ?? "";
  // A missing file is served as index.html by the dev server's SPA fallback; don't feed that to the engine.
  if (!res.ok || type.includes("html")) throw new Error(`model file not served (HTTP ${res.status}, ${type || "no type"})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length < MIN_MODEL_BYTES) throw new Error(`model file looks truncated (${bytes.length} bytes); delete web/public/models and re-run npm run dev`);
  return bytes;
}

async function createLandmarker(delegate: Delegate, masks: boolean): Promise<PoseLandmarker> {
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
      outputSegmentationMasks: masks,
    });
  } catch (e) {
    throw new PoseError(`engine-start/${delegate}`, e);
  }
}

function getLandmarker(delegate: Delegate, masks: boolean): Promise<PoseLandmarker> {
  const key = `${delegate}/${masks}`;
  if (cached?.key !== key) cached = { key, delegate, masks, instance: createLandmarker(delegate, masks) };
  const { instance } = cached;
  // Never keep a failed instance: the WASM runtime cannot be reused after an abort.
  instance.catch(() => {
    if (cached?.instance === instance) cached = null;
  });
  return instance;
}

function discard(delegate: Delegate, masks: boolean) {
  if (cached?.key === `${delegate}/${masks}`) {
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
  /** `mask`: torso widths from the body silhouette. `landmarks`: pose points only (less precise). */
  mode: "mask" | "landmarks";
}

export type Stage = "loading" | "analyzing" | "silhouette";

/**
 * The silhouette step is the heavy GPU-assisted part of the engine. If it ever crashes or
 * freezes the tab, the flag is left at "pending"; on the next visit we skip it automatically.
 * Override with ?mask=1 (force on) or ?mask=0 (force off).
 */
const MASK_FLAG = "bsc:mask";
function flag(): string | null {
  try {
    return localStorage.getItem(MASK_FLAG);
  } catch {
    return null;
  }
}
function setFlag(v: "pending" | "ok" | "off") {
  try {
    localStorage.setItem(MASK_FLAG, v);
  } catch {
    /* ignore */
  }
}
export function maskEnabled(): boolean {
  const q = new URLSearchParams(location.search).get("mask");
  if (q === "0") return false;
  if (q === "1") {
    setFlag("ok");
    return true;
  }
  const f = flag();
  if (f === "pending") {
    setFlag("off"); // the previous silhouette attempt never finished
    return false;
  }
  return f !== "off";
}

/** Let the browser paint the progress message before a call that blocks the main thread. */
const paint = () => new Promise<void>((r) => setTimeout(r, 60));

function runDetect(pose: PoseLandmarker, canvas: HTMLCanvasElement) {
  const result = pose.detect(canvas);
  try {
    const lm = result.landmarks[0] as Landmark[] | undefined;
    const segmentation = result.segmentationMasks?.[0];
    const mask: Mask | undefined = segmentation
      ? { data: segmentation.getAsFloat32Array(), width: segmentation.width, height: segmentation.height }
      : undefined;
    return { lm, mask };
  } finally {
    result.close?.();
  }
}

/** Runs entirely in the browser: the photo is never uploaded. */
export async function analyzePhoto(
  file: File,
  heightCm: number,
  onStage: (stage: Stage) => void = () => {},
): Promise<PhotoAnalysis> {
  const canvas = await toCanvas(file);
  const frame = { width: canvas.width, height: canvas.height };
  const errors: string[] = [];

  // Phase 1: pose landmarks only (no silhouette) — the lightweight, reliable path.
  let base: PhotoAnalysis | null = null;
  for (const delegate of ["CPU", "GPU"] as const) {
    try {
      onStage("loading");
      const pose = await withTimeout(getLandmarker(delegate, false), START_TIMEOUT_MS[delegate], `engine-start/${delegate}`);
      onStage("analyzing");
      await paint();
      const { lm } = runDetect(pose, canvas);
      const issues = assessPhoto(lm, undefined, frame);
      base = {
        issues,
        mode: "landmarks",
        measures: hasBlockingIssue(issues) || !lm ? null : extractLandmarkMeasures(lm, frame, heightCm),
      };
      break;
    } catch (e) {
      const err = e instanceof PoseError ? e : new PoseError(`detect/${delegate}`, e);
      errors.push(err.message);
      discard(delegate, false);
      if (err.stage === "model") break; // a missing/corrupt model fails the same way everywhere
    }
  }
  if (!base) throw new Error([...errors, ...(consoleTail.length ? ["--- console ---", ...consoleTail] : [])].join("\n"));
  if (!base.measures || !maskEnabled()) return base;

  // Phase 2: refine with the body silhouette. Failure here is non-fatal.
  try {
    onStage("silhouette");
    setFlag("pending");
    await paint();
    const pose = await withTimeout(getLandmarker("CPU", true), START_TIMEOUT_MS.CPU, "engine-start/CPU+mask");
    await paint();
    const { lm, mask } = runDetect(pose, canvas);
    if (!lm || !mask) throw new Error("no silhouette returned");
    const issues = assessPhoto(lm, mask);
    setFlag("ok");
    if (hasBlockingIssue(issues)) return { issues, mode: "mask", measures: null };
    return { issues, mode: "mask", measures: extractFrontalMeasures(lm, mask, heightCm) };
  } catch (e) {
    console.error("silhouette step failed; using landmarks only", e);
    setFlag("off");
    discard("CPU", true);
    return base;
  }
}
