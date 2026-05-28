import { Hono } from "hono";
import { jsx } from "hibana-core/jsx-runtime";
import { expect, test } from "vite-plus/test";
import { hibana } from "../src/server.ts";

function createApp(options?: Parameters<typeof hibana>[0]) {
  const app = new Hono();
  app.use("*", hibana(options));
  return app;
}

test("c.render(Element) wraps outerHTML into doctype html template", async () => {
  const app = createApp();
  app.get("/", (c) => c.render(jsx("h1", { children: "Hello" })));

  const res = await app.request("/");
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/html");

  const html = await res.text();
  expect(html.startsWith("<!doctype html>")).toBe(true);
  expect(html).toContain('<html lang="en">');
  expect(html).toContain("<h1>Hello</h1>");
  expect(html).toContain("</body></html>");
});

test("c.render(string) is accepted as-is for inner body", async () => {
  const app = createApp();
  app.get("/raw", (c) => c.render("<section>raw</section>"));

  const res = await app.request("/raw");
  const html = await res.text();
  expect(html).toContain("<body><section>raw</section></body>");
});

test("default head includes client entry script and manifest preload", async () => {
  const app = createApp();
  app.get("/", (c) => c.render(jsx("div", {})));

  const html = await (await app.request("/")).text();
  expect(html).toContain('<script type="module" src="/assets/main.js">');
  expect(html).toContain('<link rel="modulepreload" href="/assets/main.js">');
  expect(html).toContain('<link rel="preload" href="/islands.json" as="fetch"');
});

test("options override clientEntry / manifestPath / lang", async () => {
  const app = createApp({
    clientEntry: "/build/entry.js",
    manifestPath: "/build/islands.json",
    lang: "ja",
  });
  app.get("/", (c) => c.render(jsx("p", {})));

  const html = await (await app.request("/")).text();
  expect(html).toContain('<html lang="ja">');
  expect(html).toContain('src="/build/entry.js"');
  expect(html).toContain('href="/build/islands.json"');
});

test("nested element produces correct outerHTML", async () => {
  const app = createApp();
  app.get("/", (c) =>
    c.render(
      jsx("main", {
        children: jsx("article", {
          children: [jsx("h2", { children: "T" }), jsx("p", { children: "body" })],
        }),
      }),
    ),
  );

  const html = await (await app.request("/")).text();
  expect(html).toContain("<main><article><h2>T</h2><p>body</p></article></main>");
});
