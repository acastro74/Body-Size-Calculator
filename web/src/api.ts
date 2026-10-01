import { SizeChartSchema, type SizeChart } from "@bsc/shared";

export class ApiError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

async function post(body: unknown): Promise<SizeChart> {
  const res = await fetch("/api/parse-size-chart", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(json.error ?? "upstream_error");
  return SizeChartSchema.parse(json.chart);
}

export function parseChartText(text: string) {
  return post({ text });
}

export async function parseChartImage(file: File) {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return post({ imageBase64: btoa(bin), mediaType: file.type || "image/png" });
}
