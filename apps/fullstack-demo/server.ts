import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { hibana } from "hibana";
import path from "node:path";
import indexRoute from "./app/routes/index.ts";

const DIST = path.resolve("dist");

const app = new Hono();

// build artifact 配信 (per-island chunk / islands manifest / その他 asset)
app.use("/assets/*", serveStatic({ root: "./dist" }));
app.use("/islands.json", serveStatic({ path: "./dist/islands.json" }));

// hibana middleware: c.render を install + server bundle を起動時 1 度 load
app.use(
  "*",
  hibana({
    serverBundlePath: path.join(DIST, ".server", "server.mjs"),
    clientEntry: "/assets/index.js",
    manifestPath: "/islands.json",
  }),
);

// routes
app.get("/", ...indexRoute);

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`hibana fullstack-demo listening on http://localhost:${info.port}`);
});
