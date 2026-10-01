import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

const logEl = document.getElementById("log")!;
const t0 = performance.now();
const lines: string[] = [];

function log(msg: string) {
  const line = `[${((performance.now() - t0) / 1000).toFixed(2)}s] ${msg}`;
  lines.push(line);
  logEl.textContent = lines.join("\n");
}

// Mirror engine console output: the WASM runtime prints the real abort reason there.
for (const level of ["log", "info", "warn", "error"] as const) {
  const orig = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    log(`console.${level}: ${args.map(String).join(" ").slice(0, 300)}`);
    orig(...args);
  };
}
window.addEventListener("error", (e) => log(`window error: ${e.message}`));
window.addEventListener("unhandledrejection", (e) => log(`unhandled rejection: ${String(e.reason)}`));

const tick = () => new Promise((r) => setTimeout(r, 30)); // let the log paint before a step that may freeze

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms / 1000}s`)), ms))]);
}

// Smallest wasm module using a SIMD instruction (v128.const … drop).
const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

function env() {
  log(`userAgent: ${navigator.userAgent}`);
  log(`cores: ${navigator.hardwareConcurrency}, deviceMemory: ${(navigator as { deviceMemory?: number }).deviceMemory ?? "n/a"} GB`);
  log(`WebAssembly: ${typeof WebAssembly}, SIMD: ${WebAssembly.validate(SIMD_PROBE)}`);
  log(`crossOriginIsolated: ${crossOriginIsolated}, OffscreenCanvas: ${typeof OffscreenCanvas}`);
  const gl = document.createElement("canvas").getContext("webgl2");
  if (!gl) log("WebGL2: NOT AVAILABLE");
  else {
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    log(`WebGL2: ok, renderer: ${dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)}`);
  }
}

async function fetchInfo(url: string) {
  const t = performance.now();
  try {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    log(`GET ${url}: HTTP ${res.status}, ${res.headers.get("content-type")}, ${buf.byteLength} bytes, ${Math.round(performance.now() - t)} ms`);
    return buf;
  } catch (e) {
    log(`GET ${url}: FAILED ${e}`);
    return null;
  }
}

let cpu: PoseLandmarker | null = null;
let cpuNoMask: PoseLandmarker | null = null;

async function create(delegate: "CPU" | "GPU", model: ArrayBuffer, timeoutMs: number, masks = true) {
  log(`createFromOptions(${delegate}, masks=${masks}) starting…`);
  await tick();
  const t = performance.now();
  const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  log(`FilesetResolver ok (${fileset.wasmLoaderPath})`);
  await tick();
  const pl = await withTimeout(
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: new Uint8Array(model), delegate },
      runningMode: "IMAGE",
      numPoses: 1,
      outputSegmentationMasks: masks,
    }),
    timeoutMs,
    `createFromOptions(${delegate})`,
  );
  log(`createFromOptions(${delegate}) OK in ${Math.round(performance.now() - t)} ms`);
  return pl;
}

function detect(pl: PoseLandmarker, source: HTMLCanvasElement, label: string) {
  log(`detect(${label}) on ${source.width}x${source.height}…`);
  const t = performance.now();
  const r = pl.detect(source);
  const mask = r.segmentationMasks?.[0];
  log(`detect OK in ${Math.round(performance.now() - t)} ms: landmarks=${r.landmarks.length}, mask=${mask ? `${mask.width}x${mask.height}` : "none"}`);
  if (mask) {
    const d = mask.getAsFloat32Array();
    let fg = 0;
    for (let i = 0; i < d.length; i++) if (d[i]! > 0.5) fg++;
    log(`mask readback OK, foreground pixels: ${fg}`);
  }
  r.close?.();
}

document.getElementById("run")!.addEventListener("click", async () => {
  try {
    env();
    await tick();
    const model = await fetchInfo("/models/pose_landmarker_full.task");
    await fetchInfo("/mediapipe/wasm/vision_wasm_internal.wasm");
    if (!model) return log("STOP: model not available");
    cpu = await create("CPU", model, 30_000);
    const blank = document.createElement("canvas");
    blank.width = 300;
    blank.height = 500;
    blank.getContext("2d")!.fillRect(0, 0, 300, 500);
    detect(cpu, blank, "blank image");
    log("CHECKS DONE — now pick a photo (step 2).");
  } catch (e) {
    log(`FAILED: ${e instanceof Error ? `${e.name}: ${e.message}` : e}`);
  }
});

document.getElementById("photo")!.addEventListener("change", async (ev) => {
  const file = (ev.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const model = await fetchInfo("/models/pose_landmarker_full.task");
    if (!model) return;
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);

    // 2a: landmarks only (no silhouette)
    cpuNoMask ??= await create("CPU", model, 30_000, false);
    log("--- 2a: landmarks only ---");
    await tick();
    detect(cpuNoMask, c, `${file.name} (no mask)`);
    log("2a OK");

    // 2b: with silhouette — this is the step that may freeze the tab
    log("--- 2b: with silhouette (if the page freezes here, the silhouette step is the problem) ---");
    await tick();
    cpu ??= await create("CPU", model, 30_000, true);
    await tick();
    detect(cpu, c, `${file.name} (with mask)`);
    log("2b OK — PHOTO TEST DONE");
  } catch (e) {
    log(`FAILED: ${e instanceof Error ? `${e.name}: ${e.message}` : e}`);
  }
});

document.getElementById("gpu")!.addEventListener("click", async () => {
  try {
    const model = await fetchInfo("/models/pose_landmarker_full.task");
    if (!model) return;
    (await create("GPU", model, 20_000)).close();
    log("GPU TEST DONE");
  } catch (e) {
    log(`FAILED: ${e instanceof Error ? `${e.name}: ${e.message}` : e}`);
  }
});

document.getElementById("copy")!.addEventListener("click", () => {
  void navigator.clipboard.writeText(lines.join("\n")).then(() => log("(report copied)"));
});
