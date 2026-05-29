import { afterEach, expect, test } from "vite-plus/test";
import {
  clearErrorPage,
  clearMiddlewares,
  clearNotFound,
  getErrorPage,
  getMiddlewares,
  getNotFound,
  registerErrorPage,
  registerMiddleware,
  registerNotFound,
} from "../../src/ssr/index.ts";

afterEach(() => {
  clearMiddlewares();
  clearNotFound();
  clearErrorPage();
});

// middleware

test("getMiddlewares: 未登録なら空配列", () => {
  expect(getMiddlewares()).toEqual([]);
});

test("registerMiddleware + getMiddlewares: default を 1 element の handlers として返す", () => {
  const mw = async () => {};
  registerMiddleware("/*", { default: mw });

  const list = getMiddlewares();
  expect(list).toHaveLength(1);
  expect(list[0]?.mountPath).toBe("/*");
  expect(list[0]?.handlers).toEqual([mw]);
});

test("registerMiddleware: default が配列なら配列として保持", () => {
  const a = async () => {};
  const b = async () => {};
  registerMiddleware("/admin/*", { default: [a, b] });

  const list = getMiddlewares();
  expect(list[0]?.handlers).toEqual([a, b]);
});

test("getMiddlewares: default を持たない module は skip", () => {
  registerMiddleware("/*", { default: () => {} });
  registerMiddleware("/admin/*", {});

  const list = getMiddlewares();
  expect(list).toHaveLength(1);
  expect(list[0]?.mountPath).toBe("/*");
});

test("registerMiddleware: 順序は register 順を保持", () => {
  registerMiddleware("/*", { default: () => {} });
  registerMiddleware("/admin/*", { default: () => {} });
  registerMiddleware("/admin/users/*", { default: () => {} });

  expect(getMiddlewares().map((m) => m.mountPath)).toEqual(["/*", "/admin/*", "/admin/users/*"]);
});

// notFound

test("getNotFound: 未登録なら null", () => {
  expect(getNotFound()).toBeNull();
});

test("registerNotFound + getNotFound: default export を component として返す", () => {
  const comp = () => null;
  registerNotFound({ default: comp });
  expect(getNotFound()).toBe(comp);
});

test("registerNotFound: 上書きされる", () => {
  const a = () => null;
  const b = () => null;
  registerNotFound({ default: a });
  registerNotFound({ default: b });
  expect(getNotFound()).toBe(b);
});

test("getNotFound: default が function 以外なら null", () => {
  registerNotFound({ default: "not a function" as unknown });
  expect(getNotFound()).toBeNull();
});

// errorPage

test("getErrorPage: 未登録なら null", () => {
  expect(getErrorPage()).toBeNull();
});

test("registerErrorPage + getErrorPage: default export を component として返す", () => {
  const comp = (props: { error: Error }) => props.error.message;
  registerErrorPage({ default: comp });
  expect(getErrorPage()).toBe(comp);
});

test("clear: 全部解除", () => {
  registerMiddleware("/*", { default: () => {} });
  registerNotFound({ default: () => null });
  registerErrorPage({ default: () => null });

  clearMiddlewares();
  clearNotFound();
  clearErrorPage();

  expect(getMiddlewares()).toEqual([]);
  expect(getNotFound()).toBeNull();
  expect(getErrorPage()).toBeNull();
});
