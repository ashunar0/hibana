import { expect, test, vi } from "vite-plus/test";
import { Owner, runWithOwner } from "../../src/reactivity/owner.ts";
import { flushSync } from "../../src/reactivity/scheduler.ts";
import { Signal } from "../../src/reactivity/signal.ts";
import { jsx, jsxs } from "../../src/renderer/jsx.ts";

test("function child renders current signal value as text", () => {
  const count = new Signal(0);
  const el = jsx("button", { children: () => count.value }) as HTMLButtonElement;
  expect(el.textContent).toBe("0");
});

test("function child updates when signal changes", () => {
  const count = new Signal(0);
  const el = jsx("button", { children: () => count.value }) as HTMLButtonElement;

  count.value = 5;
  flushSync();
  expect(el.textContent).toBe("5");
});

test("function child mixed with static via jsxs", () => {
  const count = new Signal(0);
  const el = jsxs("button", {
    children: ["Count: ", () => count.value],
  }) as HTMLButtonElement;
  expect(el.textContent).toBe("Count: 0");

  count.value = 7;
  flushSync();
  expect(el.textContent).toBe("Count: 7");
});

test("static children around a reactive child do not re-render", () => {
  const count = new Signal(0);
  const el = jsxs("p", {
    children: ["before ", () => count.value, " after"],
  }) as HTMLElement;

  expect(el.childNodes.length).toBe(3);

  count.value = 42;
  flushSync();
  expect(el.childNodes.length).toBe(3);
  expect(el.textContent).toBe("before 42 after");
});

test("nullish reactive child renders as empty string", () => {
  const maybe = new Signal<string | null>("hello");
  const el = jsx("span", { children: () => maybe.value }) as HTMLElement;
  expect(el.textContent).toBe("hello");

  maybe.value = null;
  flushSync();
  expect(el.textContent).toBe("");
});

test("function attribute updates when signal changes", () => {
  const cls = new Signal("primary");
  const el = jsx("button", { className: () => cls.value }) as HTMLButtonElement;
  expect(el.getAttribute("class")).toBe("primary");

  cls.value = "danger";
  flushSync();
  expect(el.getAttribute("class")).toBe("danger");
});

test("function boolean attribute toggles", () => {
  const off = new Signal(false);
  const el = jsx("button", {
    disabled: () => off.value,
    children: "go",
  }) as HTMLButtonElement;
  expect(el.hasAttribute("disabled")).toBe(false);

  off.value = true;
  flushSync();
  expect(el.hasAttribute("disabled")).toBe(true);

  off.value = false;
  flushSync();
  expect(el.hasAttribute("disabled")).toBe(false);
});

test("event handler (onClick) is not treated as signal binding", () => {
  const count = new Signal(0);
  const el = jsx("button", {
    onClick: () => count.value++,
    children: () => count.value,
  }) as HTMLButtonElement;
  expect(el.textContent).toBe("0");

  el.click();
  flushSync();
  expect(count.peek()).toBe(1);
  expect(el.textContent).toBe("1");
});

test("owner dispose stops reactive bindings", () => {
  const owner = new Owner(null);
  const count = new Signal(0);

  const el = runWithOwner(
    owner,
    () => jsx("button", { children: () => count.value }) as HTMLButtonElement,
  );
  expect(el.textContent).toBe("0");

  count.value = 1;
  flushSync();
  expect(el.textContent).toBe("1");

  owner.dispose();

  count.value = 999;
  flushSync();
  expect(el.textContent).toBe("1");
});

test("§8 Counter example end-to-end", () => {
  const count = new Signal(0);
  const button = jsxs("button", {
    onClick: () => count.value++,
    children: ["Count: ", () => count.value],
  }) as HTMLButtonElement;

  expect(button.textContent).toBe("Count: 0");

  button.click();
  flushSync();
  expect(button.textContent).toBe("Count: 1");

  button.click();
  button.click();
  flushSync();
  expect(button.textContent).toBe("Count: 3");
});

// T9.6: reactive Node-child (Show 相当の DOM 切替)

test("function child returning Node mounts the Node directly", () => {
  const showA = new Signal(true);
  const a = document.createElement("p");
  a.textContent = "A";
  const b = document.createElement("span");
  b.textContent = "B";
  const el = jsx("div", { children: () => (showA.value ? a : b) }) as HTMLElement;

  expect(el.contains(a)).toBe(true);
  expect(el.contains(b)).toBe(false);
});

test("function child swaps Node when signal flips (Node → Node)", () => {
  const showA = new Signal(true);
  const a = document.createElement("p");
  const b = document.createElement("span");
  const el = jsx("div", { children: () => (showA.value ? a : b) }) as HTMLElement;

  showA.value = false;
  flushSync();
  expect(el.contains(a)).toBe(false);
  expect(el.contains(b)).toBe(true);
  expect(el.childNodes.length).toBe(1);
});

test("function child swaps from Node to primitive", () => {
  const showNode = new Signal(true);
  const node = document.createElement("p");
  node.textContent = "node";
  const el = jsx("div", { children: () => (showNode.value ? node : "text") }) as HTMLElement;
  expect(el.contains(node)).toBe(true);

  showNode.value = false;
  flushSync();
  expect(el.contains(node)).toBe(false);
  expect(el.textContent).toBe("text");
  expect(el.childNodes.length).toBe(1);
});

test("function child swaps from primitive to Node", () => {
  const showNode = new Signal(false);
  const node = document.createElement("p");
  node.textContent = "node";
  const el = jsx("div", { children: () => (showNode.value ? node : "text") }) as HTMLElement;
  expect(el.textContent).toBe("text");

  showNode.value = true;
  flushSync();
  expect(el.contains(node)).toBe(true);
  expect(el.childNodes.length).toBe(1);
});

test("function child returning null then a Node", () => {
  const value = new Signal<HTMLElement | null>(null);
  const el = jsx("div", { children: () => value.value }) as HTMLElement;
  expect(el.textContent).toBe("");
  expect(el.childNodes.length).toBe(1); // 空 text node が 1 個

  const p = document.createElement("p");
  p.textContent = "hi";
  value.value = p;
  flushSync();
  expect(el.contains(p)).toBe(true);
  expect(el.childNodes.length).toBe(1);
});

test("static siblings around a reactive Node-child do not move", () => {
  const showA = new Signal(true);
  const a = document.createElement("p");
  a.textContent = "A";
  const b = document.createElement("span");
  b.textContent = "B";
  const el = jsxs("div", {
    children: ["before ", () => (showA.value ? a : b), " after"],
  }) as HTMLElement;

  expect(el.childNodes.length).toBe(3);
  showA.value = false;
  flushSync();
  expect(el.childNodes.length).toBe(3);
  expect(el.firstChild?.textContent).toBe("before ");
  expect(el.lastChild?.textContent).toBe(" after");
});

test("reactive binding tracks only signals read in the getter", () => {
  const shown = new Signal(true);
  const value = new Signal(10);
  const irrelevant = new Signal("x");
  const fn = vi.fn(() => (shown.value ? value.value : "—"));

  const el = jsx("span", { children: fn }) as HTMLElement;
  expect(fn).toHaveBeenCalledTimes(1);
  expect(el.textContent).toBe("10");

  irrelevant.value = "y";
  flushSync();
  expect(fn).toHaveBeenCalledTimes(1);

  value.value = 20;
  flushSync();
  expect(fn).toHaveBeenCalledTimes(2);
  expect(el.textContent).toBe("20");
});
