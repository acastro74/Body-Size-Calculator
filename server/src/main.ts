import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync } from "node:fs";
import { createApp } from "./app";
import { createAnthropicParser } from "./parseSizeChart";

const app = createApp(createAnthropicParser());

// In production the built web app is served by this process.
if (existsSync("web/dist")) {
  app.use("/*", serveStatic({ root: "web/dist" }));
  app.get("*", serveStatic({ path: "web/dist/index.html" }));
}

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => console.log(`server listening on http://localhost:${port}`));
