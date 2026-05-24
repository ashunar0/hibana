import { expect, test } from "vite-plus/test";
import { compile } from "../../src/compiler/compile.ts";

test("component body 末尾の JSX → 自動 return", () => {
  const src = `component Counter() {
  const count = new Signal(0);
  <button>Hello</button>;
}`;
  const out = compile(src);
  expect(out).toContain("function Counter()");
  expect(out).not.toContain("component Counter(");
  expect(out).toContain("return <button>Hello</button>;");
  expect(out).not.toContain("@hib-component");
});

test("component 内の前置 statement はそのまま、 末尾 expression だけ return", () => {
  const src = `component Foo() {
  console.log("setup");
  <button>x</button>;
}`;
  const out = compile(src);
  expect(out).toContain('console.log("setup");');
  expect(out).toContain("return <button>x</button>;");
});

test("realistic Counter (component + onClick + signal binding)", () => {
  const src = `component Counter() {
  const count = new Signal(0);
  <button onClick={() => count.value++}>Count: {count.value}</button>;
}`;
  const out = compile(src);
  expect(out).toContain("function Counter()");
  expect(out).toContain("return <button");
  expect(out).toContain("onClick={() => count.value++}");
  expect(out).toContain("Count: {() => count.value}</button>");
});

test("非 component の function は触らない", () => {
  const src = `function helper() { return 1; }
const x = 42;`;
  const out = compile(src);
  expect(out).toContain("function helper()");
  expect(out).toContain("const x = 42");
});

test("helper function 内の JSX は thunk 化されない (component scope 限定)", () => {
  const src = `function helper() {
  const x = <button>{count.value}</button>;
  return x;
}`;
  const out = compile(src);
  expect(out).toContain("<button>{count.value}</button>");
  expect(out).not.toContain("() => count.value");
});

test("末尾が return 文の component はそのまま (二重 return 化しない)", () => {
  // 既に明示 return がある場合は何もしない (do-block fallback)
  const src = `component Foo() {
  return <button>x</button>;
}`;
  const out = compile(src);
  expect(out).toContain("function Foo()");
  expect(out).toContain("return <button>x</button>");
  // return が二重に巻かれていない
  expect(out).not.toMatch(/return\s+return/);
});
