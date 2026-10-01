// Copies the MediaPipe WASM runtime next to the app and fetches the pose model once.
// Both live under web/public and are git-ignored; the photo never leaves the browser.
import { cp, mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

// The package exports only its bundles, so resolve the entry and look for ./wasm beside it.
const wasmSrc = resolve(dirname(require.resolve("@mediapipe/tasks-vision")), "wasm");
await mkdir(resolve(root, "public/mediapipe"), { recursive: true });
await cp(wasmSrc, resolve(root, "public/mediapipe/wasm"), { recursive: true });

const modelPath = resolve(root, "public/models/pose_landmarker_full.task");
const exists = await stat(modelPath).then(() => true, () => false);
if (!exists) {
  const url =
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task";
  console.log("Downloading pose model…");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Model download failed: ${res.status}`);
  await mkdir(dirname(modelPath), { recursive: true });
  await writeFile(modelPath, Buffer.from(await res.arrayBuffer()));
}
