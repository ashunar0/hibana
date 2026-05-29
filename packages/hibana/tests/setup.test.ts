import {
  clearErrorPage,
  clearMiddlewares,
  clearNotFound,
  clearRoutes,
  registerErrorPage,
  registerMiddleware,
  registerNotFound,
  registerRoute,
} from "hibana-compiler/ssr";
import { Hono } from "hono";
import { afterEach, expect, test } from "vite-plus/test";
import { setupHibana } from "../src/setup.ts";

afterEach(() => {
  clearRoutes();
  clearMiddlewares();
  clearNotFound();
  clearErrorPage();
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

test('setupHibana: cssEntries option で <link rel="stylesheet"> を head に inject', async () => {
  registerRoute("/", {
    default: (c: { render: (s: string) => Response }) => c.render("<p>home</p>"),
  });

  const app = new Hono();
  await setupHibana(app, {
    cssEntries: ["/assets/index.css", "/assets/extra.css"],
  });

  const html = await (await app.request("/")).text();
  expect(html).toContain('<link rel="stylesheet" href="/assets/index.css">');
  expect(html).toContain('<link rel="stylesheet" href="/assets/extra.css">');
  // body の前 (= head 内) に来てることを ordering で確認
  const linkIdx = html.indexOf('<link rel="stylesheet" href="/assets/index.css">');
  const bodyIdx = html.indexOf("<body>");
  expect(linkIdx).toBeGreaterThan(0);
  expect(linkIdx).toBeLessThan(bodyIdx);
});

test('setupHibana: cssEntries 未指定なら <link rel="stylesheet"> は emit されない', async () => {
  registerRoute("/", {
    default: (c: { render: (s: string) => Response }) => c.render("<p>home</p>"),
  });

  const app = new Hono();
  await setupHibana(app);

  const html = await (await app.request("/")).text();
  expect(html).not.toContain('rel="stylesheet"');
});

test("setupHibana: partialHeader 指定済 + request にその header がある → fragment 直返し (= layout/HTML template wrap 省略)", async () => {
  registerRoute("/", {
    default: (c: { render: (s: string) => Response }) => c.render("<p>home</p>"),
  });

  const app = new Hono();
  await setupHibana(app, { partialHeader: "X-Hibana-Partial" });

  const res = await app.request("/", { headers: { "X-Hibana-Partial": "main" } });
  const body = await res.text();
  expect(res.status).toBe(200);
  expect(body).toBe("<p>home</p>");
  expect(body.startsWith("<!doctype")).toBe(false);
  expect(body).not.toContain("<html");
  expect(body).not.toContain("<body>");
});

test("setupHibana: partialHeader 指定済 + request に header なし → 従来 full HTML", async () => {
  registerRoute("/", {
    default: (c: { render: (s: string) => Response }) => c.render("<p>home</p>"),
  });

  const app = new Hono();
  await setupHibana(app, { partialHeader: "X-Hibana-Partial" });

  const html = await (await app.request("/")).text();
  expect(html.startsWith("<!doctype html>")).toBe(true);
  expect(html).toContain("<p>home</p>");
});

test("setupHibana: partialHeader 未指定なら header があっても full HTML 維持", async () => {
  registerRoute("/", {
    default: (c: { render: (s: string) => Response }) => c.render("<p>home</p>"),
  });

  const app = new Hono();
  await setupHibana(app);

  const html = await (await app.request("/", { headers: { "X-Hibana-Partial": "main" } })).text();
  expect(html.startsWith("<!doctype html>")).toBe(true);
  expect(html).toContain("<p>home</p>");
});

test("setupHibana: _middleware を mountPath で配線", async () => {
  let seen = "";
  registerMiddleware("/admin/*", {
    default: async (c: { res: { headers: Headers } }, next: () => Promise<void>) => {
      seen = "admin-mw";
      await next();
      c.res.headers.set("X-Admin", "yes");
    },
  });
  registerRoute("/admin/panel", {
    default: (c: { text: (s: string) => Response }) => c.text("panel"),
  });
  registerRoute("/public", {
    default: (c: { text: (s: string) => Response }) => c.text("pub"),
  });

  const app = new Hono();
  await setupHibana(app);

  const r1 = await app.request("/admin/panel");
  expect(await r1.text()).toBe("panel");
  expect(r1.headers.get("X-Admin")).toBe("yes");
  expect(seen).toBe("admin-mw");

  seen = "";
  const r2 = await app.request("/public");
  expect(await r2.text()).toBe("pub");
  expect(r2.headers.get("X-Admin")).toBeNull();
  expect(seen).toBe(""); // /public は /admin/* に match しないので middleware 走らない
});

test("setupHibana: _404 が登録されてれば notFound に配線、 status 404", async () => {
  registerNotFound({
    default: () => "<p>not found</p>",
  });

  const app = new Hono();
  await setupHibana(app);

  const res = await app.request("/missing");
  expect(res.status).toBe(404);
  const html = await res.text();
  expect(html).toContain("<p>not found</p>");
});

test("setupHibana: _error が登録されてれば onError に配線、 status 500 + error message を props で受ける", async () => {
  registerErrorPage({
    default: (props: { error: Error }) => `<p>error: ${props.error.message}</p>`,
  });
  registerRoute("/boom", {
    default: () => {
      throw new Error("kaboom");
    },
  });

  const app = new Hono();
  await setupHibana(app);

  const res = await app.request("/boom");
  expect(res.status).toBe(500);
  const html = await res.text();
  expect(html).toContain("<p>error: kaboom</p>");
});
