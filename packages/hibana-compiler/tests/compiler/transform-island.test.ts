// transform-island の動作確認: compile pipeline 経由で <PascalCase/> →
// <hbn-island name="..."/> に書き換わることを assertion。

import { expect, test } from "vite-plus/test";
import { compile } from "../../src/compiler/compile.ts";

test('self-closing <Counter/> が <hbn-island name="Counter"/> に書き換わる', () => {
  const src = `component App() {
  <main><Counter/></main>;
}`;
  const out = compile(src);
  expect(out).toContain('<hbn-island name="Counter" />');
  expect(out).not.toContain("<Counter");
});

test("static string attribute は data-props に JSON serialize される", () => {
  const src = `component App() {
  <main><Greeting name="alice"/></main>;
}`;
  const out = compile(src);
  // data-props は JSXExpressionContainer (`{"..."}`) 形式で出力 (Rolldown の
  // unicode escape 問題回避、 transform-island.ts コメント参照)
  expect(out).toContain('name="Greeting"');
  expect(out).toContain('data-props={"{\\"name\\":\\"alice\\"}"}');
});

test("numeric / boolean / null literal も data-props に入る", () => {
  const src = `component App() {
  <main><X count={42} flag={true} empty={null}/></main>;
}`;
  const out = compile(src);
  expect(out).toContain('data-props={"{\\"count\\":42,\\"flag\\":true,\\"empty\\":null}"}');
});

test("attribute 無し component には data-props attribute を付けない", () => {
  const src = `component App() {
  <main><Counter/></main>;
}`;
  const out = compile(src);
  expect(out).toContain('<hbn-island name="Counter" />');
  expect(out).not.toContain("data-props");
});

test("boolean shorthand (`<X flag/>`) は data-props.flag = true として serialize", () => {
  const src = `component App() {
  <main><X flag/></main>;
}`;
  const out = compile(src);
  expect(out).toContain('data-props={"{\\"flag\\":true}"}');
});

test("dynamic attribute (signal access 等) は data-props に入らず drop される", () => {
  const src = `component App() {
  const sig = new Signal(0);
  <main><Counter dyn={sig.value} stat="ok"/></main>;
}`;
  const out = compile(src);
  // dyn は drop、 stat のみ serialize
  expect(out).toContain('name="Counter"');
  expect(out).toContain('data-props={"{\\"stat\\":\\"ok\\"}"}');
  expect(out).not.toContain("dyn=");
});

test("intrinsic tag (lowercase) は触らない", () => {
  const src = `component App() {
  <main><button>click</button></main>;
}`;
  const out = compile(src);
  expect(out).toContain("<button>click</button>");
  expect(out).not.toContain("hbn-island");
});

test("Fragment は jsx runtime primitive なので島化しない", () => {
  const src = `component App() {
  <Fragment><p/></Fragment>;
}`;
  const out = compile(src);
  expect(out).toContain("<Fragment>");
  expect(out).not.toContain("hbn-island");
});

test("children 持ち component は触らない (slot 機能未対応)", () => {
  const src = `component App() {
  <main><Wrap><p>inner</p></Wrap></main>;
}`;
  const out = compile(src);
  expect(out).toContain("<Wrap>");
  expect(out).toContain("<p>inner</p>");
  expect(out).not.toContain("hbn-island");
});

test("ネストした component も島化される (App > Outer > Inner で Outer と Inner 両方)", () => {
  const src = `component App() {
  <main><Greeting name="a"/><Counter/></main>;
}`;
  const out = compile(src);
  expect(out).toContain('name="Greeting"');
  expect(out).toContain('name="Counter"');
  expect(out).not.toContain("<Greeting");
  expect(out).not.toContain("<Counter");
});
