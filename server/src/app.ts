import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { ParseChartRequestSchema } from "@bsc/shared";
import Anthropic from "@anthropic-ai/sdk";
import { ChartParseError, type ChartParser } from "./parseSizeChart";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const RATE_LIMIT = { windowMs: 60_000, max: 10 };

export function createApp(parse: ChartParser) {
  const app = new Hono();
  const hits = new Map<string, number[]>();

  const rateLimited = (ip: string, now = Date.now()) => {
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
    recent.push(now);
    hits.set(ip, recent);
    return recent.length > RATE_LIMIT.max;
  };

  app.get("/api/health", (c) => c.json({ ok: true }));

  app.post("/api/parse-size-chart", bodyLimit({ maxSize: Math.ceil(MAX_IMAGE_BYTES * 1.4) + 4096, onError: (c) => c.json({ error: "too_large" }, 413) }), async (c) => {
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (rateLimited(ip)) return c.json({ error: "rate_limited" }, 429);

    const body = ParseChartRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid_request" }, 400);
    if ("imageBase64" in body.data && Buffer.byteLength(body.data.imageBase64, "base64") > MAX_IMAGE_BYTES) {
      return c.json({ error: "too_large" }, 413);
    }

    try {
      return c.json({ chart: await parse(body.data) });
    } catch (err) {
      if (err instanceof ChartParseError) return c.json({ error: "no_chart", message: err.message }, 422);
      if (err instanceof Anthropic.RateLimitError) return c.json({ error: "upstream_busy" }, 503);
      if (err instanceof Anthropic.AuthenticationError) return c.json({ error: "server_misconfigured" }, 500);
      if (err instanceof Anthropic.APIError) return c.json({ error: "upstream_error" }, 502);
      throw err;
    }
  });

  return app;
}
