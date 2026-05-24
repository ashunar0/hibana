import { expect, test } from "vite-plus/test";
import { compile } from "../../src/compiler/compile.ts";

// JSX expression の thunk 化 (signal binding) のスナップショット系 test。
// compile() の出力に含まれる文字列で確認する (AST snapshot は別途)。

function compileRender(jsx: string): string {
  return compile(`function C() { render { ${jsx}; } }`);
}

test("signal access in child → thunk", () => {
  const out = compileRender("<p>{count.value}</p>");
  expect(out).toContain("<p>{() => count.value}</p>");
});

test("function call in child → thunk", () => {
  const out = compileRender("<p>{getValue()}</p>");
  expect(out).toContain("<p>{() => getValue()}</p>");
});

test("conditional expression in child → thunk", () => {
  const out = compileRender("<p>{flag.value ? 'a' : 'b'}</p>");
  expect(out).toContain("<p>{() => flag.value ? 'a' : 'b'}</p>");
});

test("static literal in child → NOT thunked", () => {
  const out = compileRender("<p>{42}</p>");
  expect(out).toContain("<p>{42}</p>");
  expect(out).not.toContain("() => 42");
});

test("string literal in child → NOT thunked", () => {
  const out = compileRender('<p>{"hello"}</p>');
  expect(out).toContain('<p>{"hello"}</p>');
});

test("identifier in child → NOT thunked (avoid over-thunking)", () => {
  const out = compileRender("<p>{name}</p>");
  expect(out).toContain("<p>{name}</p>");
  expect(out).not.toContain("() => name");
});

test("already a thunk → NOT double-wrapped", () => {
  const out = compileRender("<p>{() => count.value}</p>");
  expect(out).toContain("<p>{() => count.value}</p>");
  expect(out).not.toContain("() => () => count.value");
});

test("attribute with signal access → thunk", () => {
  const out = compileRender("<button disabled={off.value}>x</button>");
  expect(out).toContain("disabled={() => off.value}");
});

test("onClick event handler → NOT thunked", () => {
  const out = compileRender("<button onClick={() => count.value++}>x</button>");
  expect(out).toContain("onClick={() => count.value++}");
  expect(out).not.toContain("() => () => count.value++");
});

test("ref callback → NOT thunked", () => {
  const out = compileRender("<div ref={(el) => save(el)}>x</div>");
  expect(out).toContain("ref={el => save(el)}");
  expect(out).not.toContain("() => (el) => save(el)");
});

test("nested JSX children also get thunk-ified", () => {
  const out = compileRender("<div><span>{a.value}</span></div>");
  expect(out).toContain("<span>{() => a.value}</span>");
});

test("realistic Counter (full thunk-ification)", () => {
  const out = compile(`component Counter() {
  const count = new Signal(0);
  render {
    <button onClick={() => count.value++}>Count: {count.value}</button>;
  }
}`);
  expect(out).toContain("function Counter()");
  expect(out).toContain("return <button");
  expect(out).toContain("onClick={() => count.value++}");
  expect(out).toContain("Count: {() => count.value}</button>");
});

test("mixed: static text + signal in same children", () => {
  const out = compileRender("<p>before {count.value} after</p>");
  expect(out).toContain("before {() => count.value} after");
});

test("non-render JSX is NOT thunked (only inside render scope)", () => {
  // render の外の JSX は変換対象外
  const src = `function helper() {
  const x = <button>{count.value}</button>;
  return x;
}`;
  const out = compile(src);
  // render scope じゃないので thunk 化されない
  expect(out).toContain("<button>{count.value}</button>");
  expect(out).not.toContain("() => count.value");
});
