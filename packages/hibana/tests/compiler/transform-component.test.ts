import { expect, test } from "vite-plus/test";
import { transformComponent } from "../../src/compiler/transform-component.ts";

test("basic component → function (no params)", () => {
  const out = transformComponent("component Counter() {}");
  expect(out).toBe("function Counter() {}");
});

test("component with single param", () => {
  const out = transformComponent("component Counter(props) {}");
  expect(out).toBe("function Counter(props) {}");
});

test("component with typed param", () => {
  const out = transformComponent("component Counter(props: { initial: number }) {}");
  expect(out).toBe("function Counter(props: { initial: number }) {}");
});

test("leading whitespace / indentation preserved", () => {
  const out = transformComponent("  component Counter() {}");
  expect(out).toBe("  function Counter() {}");
});

test("multiple components in one file", () => {
  const src = `component A() {}
component B(props) {}
component Counter() {}`;
  const expected = `function A() {}
function B(props) {}
function Counter() {}`;
  expect(transformComponent(src)).toBe(expected);
});

test("does NOT replace lowercase identifier 'component' (variable name)", () => {
  const src = "const component = 1;";
  expect(transformComponent(src)).toBe(src);
});

test("does NOT replace 'component foo(' (PascalCase 必須)", () => {
  const src = "component foo() {}";
  expect(transformComponent(src)).toBe(src);
});

test("does NOT replace member access like obj.component", () => {
  const src = "obj.component = 1;";
  expect(transformComponent(src)).toBe(src);
});

test("does NOT replace within other identifiers (subcomponent / componentName)", () => {
  const src = "const subcomponentName = 1; subcomponent A() {}";
  expect(transformComponent(src)).toBe(src);
});

test("realistic Counter snippet", () => {
  const src = `import { Signal } from "hibana"

component Counter() {
  const count = new Signal(0)
  render {
    <button onClick={() => count.value++}>
      Count: {count.value}
    </button>
  }
}`;

  // component → function だけが変わる、render { } は T11 で別途処理
  const out = transformComponent(src);
  expect(out).toContain("function Counter() {");
  expect(out).toContain("render {");
  expect(out).not.toContain("component Counter(");
});

test("handles tab indentation", () => {
  const out = transformComponent("\tcomponent Counter() {}");
  expect(out).toBe("\tfunction Counter() {}");
});

test("regex replaces up to and including the open paren", () => {
  // `component Foo(` までが置換対象、後続の `)` 等は元コードに残る
  const out = transformComponent("component Counter()");
  expect(out).toBe("function Counter()");
});
