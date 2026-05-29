import { afterEach, expect, test } from "vite-plus/test";
import { clearLayout, getLayout, registerLayout } from "../../src/ssr/index.ts";

afterEach(() => {
  clearLayout();
});

test("getLayout: 未登録なら null", () => {
  expect(getLayout()).toBeNull();
});

test("registerLayout + getLayout: default export を component として返す", () => {
  const layout = (props: { children: unknown }) => props.children;
  registerLayout({ default: layout });

  expect(getLayout()).toBe(layout);
});

test("registerLayout: 既登録の layout を上書き", () => {
  const a = (props: { children: unknown }) => props.children;
  const b = (props: { children: unknown }) => props.children;
  registerLayout({ default: a });
  registerLayout({ default: b });

  expect(getLayout()).toBe(b);
});

test("getLayout: default が function 以外 (= undefined / 値) なら null", () => {
  registerLayout({ default: "string-layout" as unknown });
  expect(getLayout()).toBeNull();

  registerLayout({});
  expect(getLayout()).toBeNull();
});

test("clearLayout: 解除", () => {
  registerLayout({ default: () => null });
  expect(getLayout()).not.toBeNull();

  clearLayout();
  expect(getLayout()).toBeNull();
});
