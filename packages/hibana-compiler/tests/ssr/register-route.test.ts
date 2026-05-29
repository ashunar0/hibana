import { afterEach, expect, test } from "vite-plus/test";
import { clearRoutes, getRoutes, registerRoute } from "../../src/ssr/index.ts";

afterEach(() => {
  clearRoutes();
});

test("registerRoute: default export を GET として登録", () => {
  const handler = (() => {}) as unknown;
  registerRoute("/", { default: handler });

  const routes = getRoutes();
  expect(routes).toHaveLength(1);
  expect(routes[0]?.path).toBe("/");
  expect(routes[0]?.methods.GET).toEqual([handler]);
});

test("registerRoute: named export POST / PUT / DELETE 等を method 別に登録", () => {
  const get = (() => {}) as unknown;
  const post = (() => {}) as unknown;
  const del = (() => {}) as unknown;
  registerRoute("/posts/:id", { GET: get, POST: post, DELETE: del });

  const routes = getRoutes();
  expect(routes).toHaveLength(1);
  expect(routes[0]?.methods.GET).toEqual([get]);
  expect(routes[0]?.methods.POST).toEqual([post]);
  expect(routes[0]?.methods.DELETE).toEqual([del]);
});

test("registerRoute: GET named export があれば default は無視", () => {
  const named = (() => {}) as unknown;
  const def = (() => {}) as unknown;
  registerRoute("/", { default: def, GET: named });

  const routes = getRoutes();
  expect(routes[0]?.methods.GET).toEqual([named]);
});

test("registerRoute: handlers が配列の場合はそのまま展開", () => {
  const mw = (() => {}) as unknown;
  const handler = (() => {}) as unknown;
  registerRoute("/", { default: [mw, handler] });

  const routes = getRoutes();
  expect(routes[0]?.methods.GET).toEqual([mw, handler]);
});

test("registerRoute: handler を何も持たない module は no-op", () => {
  registerRoute("/", {});

  expect(getRoutes()).toEqual([]);
});

test("getRoutes: snapshot 返却なので mutate しても registry に影響なし", () => {
  registerRoute("/a", { default: () => {} });
  const snap = getRoutes();
  snap.length = 0;
  expect(getRoutes()).toHaveLength(1);
});

test("clearRoutes: registry を空に", () => {
  registerRoute("/a", { default: () => {} });
  registerRoute("/b", { default: () => {} });
  expect(getRoutes()).toHaveLength(2);

  clearRoutes();
  expect(getRoutes()).toEqual([]);
});
