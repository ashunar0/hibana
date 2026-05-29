import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { setupHibana } from "hibana";
import { Hono } from "hono";
import path from "node:path";

const DIST = path.resolve("dist");

const app = new Hono();

// build artifact 配信 (per-island chunk / islands manifest / その他 asset)
app.use("/assets/*", serveStatic({ root: "./dist" }));
app.use("/islands.json", serveStatic({ path: "./dist/islands.json" }));

// hibana 一式を 1 行 install:
// - happy-dom + server bundle を起動時 1 度 load
// - c.render middleware を install
// - app/routes/ 配下の file-based routes を自動配線
await setupHibana(app, {
  serverBundlePath: path.join(DIST, ".server", "server.mjs"),
  clientEntry: "/assets/index.js",
  manifestPath: "/islands.json",
});

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`hibana fullstack-demo listening on http://localhost:${info.port}`);
});
