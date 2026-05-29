import { clearRoutes, registerRoute } from "hibana-compiler/ssr";
import { Hono } from "hono";
import { afterEach, expect, test } from "vite-plus/test";
import { setupHibana } from "../src/setup.ts";

afterEach(() => {
  clearRoutes();
});

test("setupHibana: registry の default export を GET に配線", async () => {
  registerRoute("/hello", { default: (c: { text: (s: string) => Response }) => c.text("hi") });

  const app = new Hono();
  await setupHibana(app);

  const res = await app.request("/hello");
  expect(res.status).toBe(200);
  expect(await res.text()).toBe("hi");
});

test("setupHibana: GET / POST を別々に配線、 POST は body parse 込み", async () => {
  registerRoute("/posts", {
    GET: (c: { json: (v: unknown) => Response }) => c.json({ posts: [] }),
    POST: async (c: {
      json: (v: unknown, status?: number) => Response;
      req: { json: () => Promise<unknown> };
    }) => {
      const body = await c.req.json();
      return c.json({ created: body }, 201);
    },
  });

  const app = new Hono();
  await setupHibana(app);

  const getRes = await app.request("/posts");
  expect(getRes.status).toBe(200);
  expect(await getRes.json()).toEqual({ posts: [] });

  const postRes = await app.request("/posts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "t" }),
  });
  expect(postRes.status).toBe(201);
  expect(await postRes.json()).toEqual({ created: { title: "t" } });
});

test("setupHibana: dynamic param (:slug) も配線できる", async () => {
  registerRoute("/blog/:slug", {
    default: (c: { text: (s: string) => Response; req: { param: (k: string) => string } }) =>
      c.text(`slug=${c.req.param("slug")}`),
  });

  const app = new Hono();
  await setupHibana(app);

  const res = await app.request("/blog/hello-world");
  expect(await res.text()).toBe("slug=hello-world");
});

test("setupHibana: 後追いの app.get(...) も共存", async () => {
  registerRoute("/", { default: (c: { text: (s: string) => Response }) => c.text("home") });

  const app = new Hono();
  await setupHibana(app);
  app.get("/api/health", (c) => c.json({ ok: true }));

  expect(await (await app.request("/")).text()).toBe("home");
  expect(await (await app.request("/api/health")).json()).toEqual({ ok: true });
});

test("setupHibana: c.render middleware も install (Renderer 経由で HTML template wrap)", async () => {
  registerRoute("/", {
    default: (c: { render: (s: string) => Response }) => c.render("<p>home</p>"),
  });

  const app = new Hono();
  await setupHibana(app);

  const html = await (await app.request("/")).text();
  expect(html.startsWith("<!doctype html>")).toBe(true);
  expect(html).toContain("<p>home</p>");
});
