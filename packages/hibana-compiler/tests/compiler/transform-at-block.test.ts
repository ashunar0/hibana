import { expect, test } from "vite-plus/test";
import { HBN_DO_MARKER, transformAtBlock } from "../../src/compiler/transform-at-block.ts";

const M = `/*${HBN_DO_MARKER}*/`;

test("basic: @{ ternary } → marker 付き block body arrow thunk", () => {
  const out = transformAtBlock("@{ flag.value ? <A/> : <B/> }");
  expect(out).toBe(`{(${M}() => { flag.value ? <A/> : <B/> })}`);
});

test("preserves surrounding JSX context", () => {
  const out = transformAtBlock("<div>@{ count.value > 0 ? <p/> : <span/> }</div>");
  expect(out).toBe(`<div>{(${M}() => { count.value > 0 ? <p/> : <span/> })}</div>`);
});

test("JSX 内の {} は brace count に組み込まれて正しく対応する", () => {
  const out = transformAtBlock("@{ <p>{count.value}</p> }");
  expect(out).toBe(`{(${M}() => { <p>{count.value}</p> })}`);
});

test("statement 列: const + 末尾 JSX (auto-return は plugin で行う)", () => {
  const out = transformAtBlock("@{ const x = compute(); <p>{x}</p> }");
  expect(out).toBe(`{(${M}() => { const x = compute(); <p>{x}</p> })}`);
});

test("文字列リテラル内の @{ は無視", () => {
  const src = `const s = "@{ fake }"`;
  expect(transformAtBlock(src)).toBe(src);
});

test("template literal 内の @{ は無視", () => {
  const src = "const s = `@{ fake }`";
  expect(transformAtBlock(src)).toBe(src);
});

test("line comment 内の @{ は無視", () => {
  const src = `// @{ ignored }\nconst x = 1`;
  expect(transformAtBlock(src)).toBe(src);
});

test("block comment 内の @{ は無視", () => {
  const src = `/* @{ ignored } */ const x = 1`;
  expect(transformAtBlock(src)).toBe(src);
});

test("email 等 word char に続く @ は無視", () => {
  const src = `const email = "foo@example.com"`;
  expect(transformAtBlock(src)).toBe(src);
});

test("複数の @{ } を同じ source に置く", () => {
  const out = transformAtBlock("<div>@{ a } and @{ b }</div>");
  expect(out).toBe(`<div>{(${M}() => { a })} and {(${M}() => { b })}</div>`);
});

test("@{} 内の文字列にある } は body terminator にならない", () => {
  const out = transformAtBlock(`@{ "}" + x }`);
  expect(out).toBe(`{(${M}() => { "}" + x })}`);
});

test("対応する閉じ括弧が無いと throw", () => {
  expect(() => transformAtBlock("@{ unclosed")).toThrow(/対応する閉じ括弧/);
});
