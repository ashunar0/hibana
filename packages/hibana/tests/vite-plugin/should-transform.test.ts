import { expect, test } from "vite-plus/test";
import { shouldTransform } from "../../src/vite-plugin/index.ts";

test(".ts files are skipped", () => {
  expect(shouldTransform("foo.ts", "component Foo() {}")).toBe(false);
});

test(".tsx without Pattern 3 syntax is skipped", () => {
  expect(shouldTransform("foo.tsx", "function Foo() { return <div/>; }")).toBe(false);
});

test(".tsx with `component Foo(` is transformed", () => {
  expect(shouldTransform("foo.tsx", "component Counter() {}")).toBe(true);
});

test(".tsx with `render {` is transformed", () => {
  expect(shouldTransform("foo.tsx", "function F() { render { <div/>; } }")).toBe(true);
});

test("node_modules is skipped", () => {
  expect(shouldTransform("/foo/node_modules/bar/index.tsx", "component Foo() {}")).toBe(false);
});

test("identifier `component` (lowercase) is NOT a trigger", () => {
  expect(shouldTransform("foo.tsx", "const component = 1;")).toBe(false);
});

test("`obj.render` member access is NOT a trigger", () => {
  expect(shouldTransform("foo.tsx", "obj.render { x }")).toBe(false);
});
