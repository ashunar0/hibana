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

// T16-MVP: @{ } 局所 do-block

test("@{ ternary } を含む component が compile できて auto-return される", () => {
  const src = `component Show() {
  const count = new Signal(0);
  <div>@{ count.value > 0 ? <p/> : <span/> }</div>;
}`;
  const out = compile(src);
  expect(out).toContain("function Show()");
  expect(out).toContain("return <div>");
  // @{ } は block body arrow thunk に展開され、 末尾 expr が return に昇格される
  expect(out).toMatch(/\(\)\s*=>\s*\{\s*return\s+count\.value\s*>\s*0\s*\?/);
  // marker comment は出力に残らない
  expect(out).not.toContain("@hib-do");
});

// T16-c: @{ if-else } の block-as-expression

test("@{ if-else } の各 branch 末尾が return に昇格される (block 形式)", () => {
  const src = `component C() {
  <div>@{ if (count.value > 0) { <p>positive</p> } else { <span>zero</span> } }</div>;
}`;
  const out = compile(src);
  // if-else の各 branch 末尾の JSX が return に昇格
  expect(out).toMatch(/if\s*\(count\.value\s*>\s*0\)\s*\{\s*return\s+<p>positive<\/p>/);
  expect(out).toMatch(/else\s*\{\s*return\s+<span>zero<\/span>/);
});

test("@{ if-else } 行区切りの単 statement 形式も動く", () => {
  // ASI 効くよう改行で区切る
  const src = `component C() {
  <div>@{
    if (count.value > 0) <p>positive</p>
    else <span>zero</span>
  }</div>;
}`;
  const out = compile(src);
  expect(out).toMatch(/if\s*\(count\.value\s*>\s*0\)\s*return\s+<p>positive<\/p>/);
  expect(out).toMatch(/else\s+return\s+<span>zero<\/span>/);
});

test("@{ else-if 連鎖 } も再帰的に return 昇格される", () => {
  const src = `component C() {
  <div>@{
    if (count.value === 0) { <span>zero</span> }
    else if (count.value % 2 === 0) { <strong>even</strong> }
    else { <em>odd</em> }
  }</div>;
}`;
  const out = compile(src);
  expect(out).toMatch(/return\s+<span>zero<\/span>/);
  expect(out).toMatch(/return\s+<strong>even<\/strong>/);
  expect(out).toMatch(/return\s+<em>odd<\/em>/);
});

test("@{ stmts; lastExpr } の statement 列が auto-return される (T16-b)", () => {
  const src = `component C() {
  <div>@{ const label = String(count.value); <p>{label}</p> }</div>;
}`;
  const out = compile(src);
  expect(out).toContain("function C()");
  expect(out).toContain("const label = String(count.value);");
  // 末尾の <p>{label}</p> が return に昇格
  expect(out).toMatch(/return\s+<p>\{label\}<\/p>/);
});

test("@{ } の arrow thunk は plugin の thunkify で二重 wrap されない", () => {
  const src = `component C() {
  <div>@{ flag.value ? <a/> : <b/> }</div>;
}`;
  const out = compile(src);
  expect(out).not.toMatch(/\(\)\s*=>\s*\(\)\s*=>/);
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
