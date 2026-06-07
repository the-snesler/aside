import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { initDb } from "./db/index.js";
import { pull } from "./sync/pull.js";
import { push, type PushRow } from "./sync/push.js";
import { onChange } from "./sync/stream.js";

const PORT = Number(process.env.PORT ?? 3001);
// Relative to cwd; the Docker runtime sets WORKDIR /app and STATIC_DIR=./public.
const STATIC_DIR = process.env.STATIC_DIR;

await initDb();

const app = new Hono();

app.use("/api/*", cors());

app.get("/health", (c) => c.json({ status: "ok" }));

// Pull: client sends its checkpoint, gets back changed docs + a new checkpoint.
app.post("/api/sync/pull", async (c) => {
  const body = await c.req.json<{
    checkpoint?: { id: string; updatedAt: number } | null;
    batchSize?: number;
  }>();
  const result = await pull({
    checkpoint: body.checkpoint ?? null,
    batchSize: body.batchSize ?? 100,
  });
  return c.json(result);
});

// Push: client sends changed docs; server returns conflicting master docs.
app.post("/api/sync/push", async (c) => {
  const rows = await c.req.json<PushRow[]>();
  const conflicts = await push(rows);
  return c.json(conflicts);
});

// Stream: SSE feed of changes, so a second instance updates live.
app.get("/api/sync/stream", (c) => {
  return streamSSE(c, async (stream) => {
    let closed = false;
    const unsub = onChange((event) => {
      void stream.writeSSE({ data: JSON.stringify(event) }).catch(() => {});
    });
    stream.onAbort(() => {
      closed = true;
      unsub();
    });
    // Keep the connection alive through proxies with a periodic comment ping.
    while (!closed) {
      await stream.writeSSE({ event: "ping", data: String(Date.now()) });
      await stream.sleep(15000);
    }
  });
});

// In prod the single container serves the built client from STATIC_DIR, with an
// SPA fallback to index.html for any non-API, non-file route.
if (STATIC_DIR) {
  app.use("/*", serveStatic({ root: STATIC_DIR }));
  app.get("/*", serveStatic({ path: "index.html", root: STATIC_DIR }));
}

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`aside server listening on :${info.port}`);
});
