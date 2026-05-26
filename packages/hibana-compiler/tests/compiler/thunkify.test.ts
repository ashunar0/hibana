import { expect, test } from "vite-plus/test";
import { compile } from "../../src/compiler/compile.ts";

// JSX expression の thunk 化 (signal binding) のスナップショット系 test。
// compile() の出力に含まれる文字列で確認する (AST snapshot は別途)。
//
// component body 末尾の JSX に対して thunk 化が掛かることを確認するため、
// helper を component で包む形にした (T15.6 で `render { }` を廃止し、
// component 全体が do-block scope となったため)。

function compileInComponent(jsx: string): string {
  return compile(`component C() { ${jsx}; }`);
}

test("signal access in child → thunk", () => {
  const out = compileInComponent("<p>{count.value}</p>");
  expect(out).toContain("<p>{() => count.value}</p>");
});

test("function call in child → thunk", () => {
  const out = compileInComponent("<p>{getValue()}</p>");
  expect(out).toContain("<p>{() => getValue()}</p>");
});

test("conditional expression in child → thunk", () => {
  const out = compileInComponent("<p>{flag.value ? 'a' : 'b'}</p>");
  expect(out).toContain("<p>{() => flag.value ? 'a' : 'b'}</p>");
});

test("static literal in child → NOT thunked", () => {
  const out = compileInComponent("<p>{42}</p>");
  expect(out).toContain("<p>{42}</p>");
  expect(out).not.toContain("() => 42");
});

test("string literal in child → NOT thunked", () => {
  const out = compileInComponent('<p>{"hello"}</p>');
  expect(out).toContain('<p>{"hello"}</p>');
});

test("identifier in child → NOT thunked (avoid over-thunking)", () => {
  const out = compileInComponent("<p>{name}</p>");
  expect(out).toContain("<p>{name}</p>");
  expect(out).not.toContain("() => name");
});

test("already a thunk → NOT double-wrapped", () => {
  const out = compileInComponent("<p>{() => count.value}</p>");
  expect(out).toContain("<p>{() => count.value}</p>");
  expect(out).not.toContain("() => () => count.value");
});

test("attribute with signal access → thunk", () => {
  const out = compileInComponent("<button disabled={off.value}>x</button>");
  expect(out).toContain("disabled={() => off.value}");
});

test("onClick event handler → NOT thunked", () => {
  const out = compileInComponent("<button onClick={() => count.value++}>x</button>");
  expect(out).toContain("onClick={() => count.value++}");
  expect(out).not.toContain("() => () => count.value++");
});

test("ref callback → NOT thunked", () => {
  const out = compileInComponent("<div ref={(el) => save(el)}>x</div>");
  expect(out).toContain("ref={el => save(el)}");
  expect(out).not.toContain("() => (el) => save(el)");
});

test("nested JSX children also get thunk-ified", () => {
  const out = compileInComponent("<div><span>{a.value}</span></div>");
  expect(out).toContain("<span>{() => a.value}</span>");
});

test("realistic Counter (full thunk-ification)", () => {
  const out = compile(`component Counter() {
  const count = new Signal(0);
  <button onClick={() => count.value++}>Count: {count.value}</button>;
}`);
  expect(out).toContain("function Counter()");
  expect(out).toContain("return <button");
  expect(out).toContain("onClick={() => count.value++}");
  expect(out).toContain("Count: {() => count.value}</button>");
});

test("mixed: static text + signal in same children", () => {
  const out = compileInComponent("<p>before {count.value} after</p>");
  expect(out).toContain("before {() => count.value} after");
});

test("component (PascalCase tag) の attribute は thunk 化されない (props として渡る)", () => {
  // <Counter index={step.value - 1}/> のような case。
  // intrinsic と同じく thunk 化すると props.index が () => ... の関数になり、
  // 受け側で props.index() のような書き換えが要る → React 慣習で大文字始まりは component と判定
  const out = compileInComponent("<MyComp index={step.value - 1} name={user.name}>x</MyComp>");
  expect(out).toContain("index={step.value - 1}");
  expect(out).toContain("name={user.name}");
  expect(out).not.toContain("() => step.value - 1");
  expect(out).not.toContain("() => user.name");
});

test("intrinsic (lowercase tag) の attribute は thunk 化される (signal binding)", () => {
  // 既存の attribute thunk 化が回帰してないか
  const out = compileInComponent("<input value={text.value} disabled={busy.value}/>");
  expect(out).toContain("value={() => text.value}");
  expect(out).toContain("disabled={() => busy.value}");
});

test("非 component の function 内 JSX は thunk 化されない (component scope 限定)", () => {
  const src = `function helper() {
  const x = <button>{count.value}</button>;
  return x;
}`;
  const out = compile(src);
  expect(out).toContain("<button>{count.value}</button>");
  expect(out).not.toContain("() => count.value");
});
