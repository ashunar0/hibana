import { expect, test } from "vite-plus/test";
import { HIB_RENDER_LABEL, transformRender } from "../../src/compiler/transform-render.ts";

test("basic render { } → labeled block", () => {
  const out = transformRender("render { <button/> }");
  expect(out).toBe(`${HIB_RENDER_LABEL}: { <button/> }`);
});

test("preserves leading whitespace", () => {
  const out = transformRender("  render {\n    <button/>\n  }");
  expect(out).toBe(`  ${HIB_RENDER_LABEL}: {\n    <button/>\n  }`);
});

test("does NOT replace 'render' identifier without trailing brace", () => {
  expect(transformRender("const render = 1;")).toBe("const render = 1;");
  expect(transformRender("render()")).toBe("render()");
});

test("does NOT replace member access (obj.render)", () => {
  expect(transformRender("obj.render { x }")).toBe("obj.render { x }");
});

test("realistic Counter snippet", () => {
  const src = `function Counter() {
  const count = new Signal(0)
  render {
    <button onClick={() => count.value++}>Count: {count.value}</button>
  }
}`;

  const out = transformRender(src);
  expect(out).toContain(`${HIB_RENDER_LABEL}: {`);
  expect(out).not.toContain("render {");
  // 中身は変えてない
  expect(out).toContain("<button onClick={() => count.value++}>Count: {count.value}</button>");
});
