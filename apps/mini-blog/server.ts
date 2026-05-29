import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { setupHibana } from "hibana";
import { Hono } from "hono";
import path from "node:path";

const DIST = path.resolve("dist");

const app = new Hono();

app.use("/assets/*", serveStatic({ root: "./dist" }));
app.use("/islands.json", serveStatic({ path: "./dist/islands.json" }));

await setupHibana(app, {
  serverBundlePath: path.join(DIST, ".server", "server.mjs"),
  clientEntry: "/assets/index.js",
  manifestPath: "/islands.json",
  cssEntries: ["/assets/index.css"],
  partialHeader: "X-Hibana-Partial",
});

const port = Number(process.env.PORT ?? 3100);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`mini-blog listening on http://localhost:${info.port}`);
});
