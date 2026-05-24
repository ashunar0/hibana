import { expect, test } from "vite-plus/test";
import { transformAtBlock } from "../../src/compiler/transform-at-block.ts";

test("basic: @{ ternary } → JSX expression container + arrow thunk", () => {
  const out = transformAtBlock("@{ flag.value ? <A/> : <B/> }");
  expect(out).toBe("{(() => flag.value ? <A/> : <B/>)}");
});

test("preserves surrounding JSX context", () => {
  const out = transformAtBlock("<div>@{ count.value > 0 ? <p/> : <span/> }</div>");
  expect(out).toBe("<div>{(() => count.value > 0 ? <p/> : <span/>)}</div>");
});

test("JSX 内の {} は brace count に組み込まれて正しく対応する", () => {
  // @{ <p>{count.value}</p> } の `{count.value}` は内部 brace としてカウントされ、
  // 外側の `}` が body の終わりとして検出される
  const out = transformAtBlock("@{ <p>{count.value}</p> }");
  expect(out).toBe("{(() => <p>{count.value}</p>)}");
});

test("ネスト brace も brace 対応 (任意の式)", () => {
  // 単一 expression として閉じ括弧探しが正しく動くことの確認 (object literal 自体は MVP では非推奨)
  const out = transformAtBlock("@{ ({ a: 1, b: { c: 2 } }) }");
  expect(out).toBe("{(() => ({ a: 1, b: { c: 2 } }))}");
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
  expect(out).toBe("<div>{(() => a)} and {(() => b)}</div>");
});

test("@{} 内の文字列にある } は body terminator にならない", () => {
  const out = transformAtBlock(`@{ "}" + x }`);
  expect(out).toBe(`{(() => "}" + x)}`);
});

test("対応する閉じ括弧が無いと throw", () => {
  expect(() => transformAtBlock("@{ unclosed")).toThrow(/対応する閉じ括弧/);
});
