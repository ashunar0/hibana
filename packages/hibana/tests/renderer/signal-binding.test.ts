import { expect, test, vi } from "vite-plus/test";
import { Owner, runWithOwner } from "../../src/reactivity/owner.ts";
import { flushSync } from "../../src/reactivity/scheduler.ts";
import { Signal } from "../../src/reactivity/signal.ts";
import { jsx } from "../../src/renderer/jsx.ts";

test("function child renders current signal value as text", () => {
  const count = new Signal(0);
  const el = jsx("button", null, () => count.value) as HTMLButtonElement;
  expect(el.textContent).toBe("0");
});

test("function child updates when signal changes", () => {
  const count = new Signal(0);
  const el = jsx("button", null, () => count.value) as HTMLButtonElement;

  count.value = 5;
  flushSync();
  expect(el.textContent).toBe("5");
});

test("function child can be mixed with static children", () => {
  const count = new Signal(0);
  const el = jsx("button", null, "Count: ", () => count.value) as HTMLButtonElement;
  expect(el.textContent).toBe("Count: 0");

  count.value = 7;
  flushSync();
  expect(el.textContent).toBe("Count: 7");
});

test("static children around a reactive child do not re-render", () => {
  const count = new Signal(0);
  const el = jsx("p", null, "before ", () => count.value, " after") as HTMLElement;

  // textContent は 3 つの child node の連結
  expect(el.childNodes.length).toBe(3);

  count.value = 42;
  flushSync();
  expect(el.childNodes.length).toBe(3); // static node は触られない
  expect(el.textContent).toBe("before 42 after");
});

test("nullish / boolean reactive child renders as empty string", () => {
  const maybe = new Signal<string | null>("hello");
  const el = jsx("span", null, () => maybe.value) as HTMLElement;
  expect(el.textContent).toBe("hello");

  maybe.value = null;
  flushSync();
  expect(el.textContent).toBe("");
});

test("function attribute updates when signal changes", () => {
  const cls = new Signal("primary");
  const el = jsx("button", { className: () => cls.value }, null) as HTMLButtonElement;
  expect(el.getAttribute("class")).toBe("primary");

  cls.value = "danger";
  flushSync();
  expect(el.getAttribute("class")).toBe("danger");
});

test("function boolean attribute toggles", () => {
  const off = new Signal(false);
  const el = jsx("button", { disabled: () => off.value }, "go") as HTMLButtonElement;
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
  const el = jsx(
    "button",
    { onClick: () => count.value++ },
    () => count.value,
  ) as HTMLButtonElement;
  expect(el.textContent).toBe("0");

  el.click();
  flushSync();
  expect(count.peek()).toBe(1);
  expect(el.textContent).toBe("1");
});

test("owner dispose stops reactive bindings", () => {
  const owner = new Owner(null);
  const count = new Signal(0);

  const el = runWithOwner(owner, () => jsx("button", null, () => count.value) as HTMLButtonElement);
  expect(el.textContent).toBe("0");

  count.value = 1;
  flushSync();
  expect(el.textContent).toBe("1");

  owner.dispose();

  count.value = 999;
  flushSync();
  expect(el.textContent).toBe("1"); // 止まってる
});

test("§8 Counter example end-to-end (no compiler)", () => {
  const count = new Signal(0);
  const button = jsx(
    "button",
    { onClick: () => count.value++ },
    "Count: ",
    () => count.value,
  ) as HTMLButtonElement;

  expect(button.textContent).toBe("Count: 0");

  button.click();
  flushSync();
  expect(button.textContent).toBe("Count: 1");

  button.click();
  button.click();
  flushSync();
  expect(button.textContent).toBe("Count: 3");
});

test("reactive binding tracks only signals read in the getter", () => {
  const shown = new Signal(true);
  const value = new Signal(10);
  const irrelevant = new Signal("x");
  const fn = vi.fn(() => (shown.value ? value.value : "—"));

  const el = jsx("span", null, fn) as HTMLElement;
  expect(fn).toHaveBeenCalledTimes(1);
  expect(el.textContent).toBe("10");

  // 関係ない signal の変更は無視
  irrelevant.value = "y";
  flushSync();
  expect(fn).toHaveBeenCalledTimes(1);

  value.value = 20;
  flushSync();
  expect(fn).toHaveBeenCalledTimes(2);
  expect(el.textContent).toBe("20");
});
