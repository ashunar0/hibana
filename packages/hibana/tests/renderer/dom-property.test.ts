import { expect, test } from "vite-plus/test";
import { flushSync } from "../../src/reactivity/scheduler.ts";
import { Signal } from "../../src/reactivity/signal.ts";
import { jsx } from "../../src/renderer/jsx.ts";

test("input value is written to DOM property (not just attribute)", () => {
  const el = jsx("input", { type: "text", value: "hello" }) as HTMLInputElement;
  expect(el.value).toBe("hello");
});

test("input value (reactive) updates DOM property on signal change", () => {
  const text = new Signal("first");
  const el = jsx("input", { type: "text", value: () => text.value }) as HTMLInputElement;
  expect(el.value).toBe("first");

  text.value = "second";
  flushSync();
  expect(el.value).toBe("second");

  // controlled: 仮に user が直接 .value を変えても、 signal 変化で上書きされる
  el.value = "user-typed";
  text.value = "reset";
  flushSync();
  expect(el.value).toBe("reset");
});

test("controlled input: clearing signal clears DOM input even after user typed", () => {
  const text = new Signal("init");
  const el = jsx("input", { type: "text", value: () => text.value }) as HTMLInputElement;
  expect(el.value).toBe("init");

  // user 入力をシミュレート
  el.value = "user wrote this";

  // signal を空に reset
  text.value = "";
  flushSync();
  expect(el.value).toBe("");
});

test("checkbox checked is written to DOM property", () => {
  const el = jsx("input", { type: "checkbox", checked: true }) as HTMLInputElement;
  expect(el.checked).toBe(true);
});

test("checkbox checked (reactive) toggles DOM property", () => {
  const on = new Signal(false);
  const el = jsx("input", { type: "checkbox", checked: () => on.value }) as HTMLInputElement;
  expect(el.checked).toBe(false);

  on.value = true;
  flushSync();
  expect(el.checked).toBe(true);

  on.value = false;
  flushSync();
  expect(el.checked).toBe(false);
});

test("textarea value is written to DOM property", () => {
  const el = jsx("textarea", { value: "multi\nline" }) as HTMLTextAreaElement;
  expect(el.value).toBe("multi\nline");
});

test("option selected is written to DOM property", () => {
  const el = jsx("option", { selected: true, value: "x" }) as HTMLOptionElement;
  expect(el.selected).toBe(true);
});

test("regular attribute (className) still uses setAttribute path", () => {
  const cls = new Signal("foo");
  const el = jsx("div", { className: () => cls.value }) as HTMLDivElement;
  expect(el.getAttribute("class")).toBe("foo");

  cls.value = "bar";
  flushSync();
  expect(el.getAttribute("class")).toBe("bar");
});
