import { Hono } from "hono";
import { expect, test } from "vite-plus/test";
import { createRoute } from "../src/factory.ts";

test("createRoute returns an array spreadable into app.get()", async () => {
  const handlers = createRoute((c) => c.text("hello"));
  expect(Array.isArray(handlers)).toBe(true);
  expect(handlers).toHaveLength(1);

  const app = new Hono();
  app.get("/", ...handlers);

  const res = await app.request("/");
  expect(res.status).toBe(200);
  expect(await res.text()).toBe("hello");
});

test("createRoute chains multiple handlers (middleware + handler)", async () => {
  const handlers = createRoute(
    async (c, next) => {
      c.header("X-Mw", "1");
      await next();
    },
    (c) => c.text("ok"),
  );
  expect(handlers).toHaveLength(2);

  const app = new Hono();
  app.get("/m", ...handlers);

  const res = await app.request("/m");
  expect(res.status).toBe(200);
  expect(res.headers.get("X-Mw")).toBe("1");
  expect(await res.text()).toBe("ok");
});

test("createRoute carries typed body access through parseBody", async () => {
  const handlers = createRoute(async (c) => {
    const body = await c.req.parseBody<{ title: string }>();
    return c.json({ received: body.title });
  });

  const app = new Hono();
  app.post("/todos", ...handlers);

  const form = new FormData();
  form.set("title", "buy milk");

  const res = await app.request("/todos", { method: "POST", body: form });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ received: "buy milk" });
});
