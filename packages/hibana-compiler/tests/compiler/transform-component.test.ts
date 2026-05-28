import { expect, test } from "vite-plus/test";
import {
  HBN_COMPONENT_MARKER,
  transformComponent,
} from "../../src/compiler/transform-component.ts";

const MARK = `/* ${HBN_COMPONENT_MARKER} */`;

test("basic component → marker + function (no params)", () => {
  const out = transformComponent("component Counter() {}");
  expect(out).toBe(`${MARK} function Counter() {}`);
});

test("component with single param", () => {
  const out = transformComponent("component Counter(props) {}");
  expect(out).toBe(`${MARK} function Counter(props) {}`);
});

test("component with typed param", () => {
  const out = transformComponent("component Counter(props: { initial: number }) {}");
  expect(out).toBe(`${MARK} function Counter(props: { initial: number }) {}`);
});

test("leading whitespace / indentation preserved", () => {
  const out = transformComponent("  component Counter() {}");
  expect(out).toBe(`  ${MARK} function Counter() {}`);
});

test("multiple components in one file", () => {
  const src = `component A() {}
component B(props) {}
component Counter() {}`;
  const expected = `${MARK} function A() {}
${MARK} function B(props) {}
${MARK} function Counter() {}`;
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
  const src = `import { Signal } from "hibana-core"

component Counter() {
  const count = new Signal(0)
  <button onClick={() => count.value++}>
    Count: {count.value}
  </button>
}`;

  const out = transformComponent(src);
  expect(out).toContain(`${MARK} function Counter() {`);
  expect(out).not.toContain("component Counter(");
});

test("handles tab indentation", () => {
  const out = transformComponent("\tcomponent Counter() {}");
  expect(out).toBe(`\t${MARK} function Counter() {}`);
});

test("regex replaces up to and including the open paren", () => {
  const out = transformComponent("component Counter()");
  expect(out).toBe(`${MARK} function Counter()`);
});

test("export component → export prefix preserved", () => {
  const out = transformComponent("export component App() {}");
  expect(out).toBe(`export ${MARK} function App() {}`);
});

test("export default component → export default prefix preserved", () => {
  const out = transformComponent("export default component App() {}");
  expect(out).toBe(`export default ${MARK} function App() {}`);
});

test("export component with params", () => {
  const out = transformComponent("export component Greet(props) {}");
  expect(out).toBe(`export ${MARK} function Greet(props) {}`);
});

test("export default component with typed props", () => {
  const out = transformComponent("export default component Box(props: { size: number }) {}");
  expect(out).toBe(`export default ${MARK} function Box(props: { size: number }) {}`);
});

test("mixed: export component + bare component in one file", () => {
  const src = `export component App() {}
component Helper() {}
export default component Page() {}`;
  const expected = `export ${MARK} function App() {}
${MARK} function Helper() {}
export default ${MARK} function Page() {}`;
  expect(transformComponent(src)).toBe(expected);
});

test("does NOT match 'export componentName' (no space-name boundary)", () => {
  // `export componentName` は変数 export とみなして触らない (PascalCase 名がない)
  const src = "export componentName";
  expect(transformComponent(src)).toBe(src);
});
