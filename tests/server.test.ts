import { describe, expect, it, vi } from "vitest";
import { createApp } from "../server/src/app";
import { ChartParseError } from "../server/src/parseSizeChart";
import { TACVASEN } from "./fixtures/charts";

const post = (app: ReturnType<typeof createApp>, body: unknown) =>
  app.request("/api/parse-size-chart", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("POST /api/parse-size-chart", () => {
  it("returns the parsed chart for text input", async () => {
    const parse = vi.fn().mockResolvedValue(TACVASEN);
    const res = await post(createApp(parse), { text: "S 42.9 ..." });
    expect(res.status).toBe(200);
    expect((await res.json()).chart.rows).toHaveLength(5);
    expect(parse).toHaveBeenCalledWith({ text: "S 42.9 ..." });
  });

  it("accepts an image", async () => {
    const parse = vi.fn().mockResolvedValue(TACVASEN);
    const res = await post(createApp(parse), { imageBase64: Buffer.from("png").toString("base64"), mediaType: "image/png" });
    expect(res.status).toBe(200);
  });

  it("rejects invalid bodies", async () => {
    expect((await post(createApp(vi.fn()), { nope: 1 })).status).toBe(400);
    expect((await post(createApp(vi.fn()), { imageBase64: "AAAA", mediaType: "image/bmp" })).status).toBe(400);
  });

  it("rejects images over 5 MB", async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 10).toString("base64");
    const res = await post(createApp(vi.fn()), { imageBase64: big, mediaType: "image/png" });
    expect(res.status).toBe(413);
  });

  it("maps a missing chart to 422", async () => {
    const res = await post(createApp(vi.fn().mockRejectedValue(new ChartParseError("none"))), { text: "hello" });
    expect(res.status).toBe(422);
  });

  it("rate limits per IP", async () => {
    const app = createApp(vi.fn().mockResolvedValue(TACVASEN));
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await post(app, { text: "x" })).status);
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[11]).toBe(429);
  });
});
