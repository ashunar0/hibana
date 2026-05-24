import { expect, test } from "vite-plus/test";
import { compile } from "../../src/compiler/compile.ts";

test("component + render → function + return", () => {
  const src = `component Counter() {
  const count = new Signal(0);
  render {
    <button>Hello</button>;
  }
}`;
  const out = compile(src);
  expect(out).toContain("function Counter()");
  expect(out).not.toContain("component Counter(");
  expect(out).toContain("return <button>Hello</button>;");
  expect(out).not.toContain("__HIB_RENDER__");
  expect(out).not.toContain("render {");
});

test("render with multiple statements: only last expression is returned", () => {
  // 現状仕様: 最後の expression statement を return、 前の文はそのまま実行
  const src = `function Foo() {
  render {
    console.log("setup");
    <button>x</button>;
  }
}`;
  const out = compile(src);
  expect(out).toContain('console.log("setup");');
  expect(out).toContain("return <button>x</button>;");
});

test("realistic Counter (component + render + onClick + signal binding)", () => {
  // T11c (thunk 化) はまだ未実装。 ここでは構文変換のみ確認
  const src = `component Counter() {
  const count = new Signal(0);
  render {
    <button onClick={() => count.value++}>Count: {count.value}</button>;
  }
}`;
  const out = compile(src);
  expect(out).toContain("function Counter()");
  expect(out).toContain("return <button");
  expect(out).toContain("onClick={() => count.value++}");
});

test("non-component code passes through untouched", () => {
  const src = `function helper() { return 1; }
const x = 42;`;
  const out = compile(src);
  expect(out).toContain("function helper()");
  expect(out).toContain("const x = 42");
});
