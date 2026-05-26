import { expect, test, vi } from "vite-plus/test";
import { Fragment, jsx, jsxs } from "../../src/renderer/jsx.ts";

test("creates an element with text child", () => {
  const el = jsx("button", { children: "hello" }) as HTMLButtonElement;
  expect(el.tagName).toBe("BUTTON");
  expect(el.textContent).toBe("hello");
});

test("applies string attributes via setAttribute", () => {
  const el = jsx("input", {
    id: "name",
    placeholder: "type here",
  }) as HTMLInputElement;
  expect(el.getAttribute("id")).toBe("name");
  expect(el.getAttribute("placeholder")).toBe("type here");
});

test("className maps to class attribute", () => {
  const el = jsx("div", { className: "foo bar" }) as HTMLElement;
  expect(el.getAttribute("class")).toBe("foo bar");
});

test("boolean attribute true sets, false removes", () => {
  const a = jsx("button", { disabled: true }) as HTMLButtonElement;
  expect(a.hasAttribute("disabled")).toBe(true);

  const b = jsx("button", { disabled: false }) as HTMLButtonElement;
  expect(b.hasAttribute("disabled")).toBe(false);
});

test("null / undefined attribute is removed", () => {
  const el = jsx("div", { id: null, "data-x": undefined }) as HTMLElement;
  expect(el.hasAttribute("id")).toBe(false);
  expect(el.hasAttribute("data-x")).toBe(false);
});

test("style object is assigned to el.style", () => {
  const el = jsx("div", {
    style: { color: "red", fontSize: "12px" },
  }) as HTMLElement;
  expect(el.style.color).toBe("red");
  expect(el.style.fontSize).toBe("12px");
});

test("onClick attaches an event listener", () => {
  const handler = vi.fn();
  const el = jsx("button", {
    onClick: handler,
    children: "click",
  }) as HTMLButtonElement;

  el.click();
  expect(handler).toHaveBeenCalledTimes(1);
});

test("multiple children via jsxs", () => {
  const el = jsxs("p", { children: ["one", " ", "two"] }) as HTMLElement;
  expect(el.textContent).toBe("one two");
});

test("nested array children are flattened", () => {
  const el = jsxs("p", {
    children: ["a", ["b", ["c", "d"]], "e"],
  }) as HTMLElement;
  expect(el.textContent).toBe("abcde");
});

test("null / undefined / boolean children are skipped", () => {
  const el = jsxs("p", {
    children: ["a", null, undefined, false, true, "b"],
  }) as HTMLElement;
  expect(el.textContent).toBe("ab");
});

test("number child becomes text node", () => {
  const el = jsx("span", { children: 42 }) as HTMLElement;
  expect(el.textContent).toBe("42");
});

test("Node child is appended directly", () => {
  const inner = jsx("span", { children: "child" }) as HTMLElement;
  const outer = jsx("div", { children: inner }) as HTMLElement;
  expect(outer.firstElementChild).toBe(inner);
});

test("component (function type) receives props with children", () => {
  const MyButton = (props: Record<string, unknown>) =>
    jsx("button", {
      className: props.variant as string,
      children: props.children as never,
    });

  const el = jsx(MyButton, {
    variant: "primary",
    children: "click",
  }) as HTMLButtonElement;
  expect(el.tagName).toBe("BUTTON");
  expect(el.getAttribute("class")).toBe("primary");
  expect(el.textContent).toBe("click");
});

test("ref callback receives the element", () => {
  let captured: Element | null = null;
  const el = jsx("div", {
    ref: (e: Element) => (captured = e),
  }) as HTMLElement;
  expect(captured).toBe(el);
});

test("Fragment returns a DocumentFragment with children", () => {
  const frag = Fragment({
    children: ["a", jsx("b", { children: "bold" }), "c"],
  }) as DocumentFragment;
  expect(frag.nodeType).toBe(11); // DOCUMENT_FRAGMENT_NODE
  expect(frag.childNodes.length).toBe(3);
  expect(frag.textContent).toBe("aboldc");
});

test("Fragment used via jsx(Fragment, {...})", () => {
  // TS automatic runtime が <>...</> を変換する形
  const frag = jsx(Fragment, { children: ["x", "y"] }) as DocumentFragment;
  expect(frag.nodeType).toBe(11);
  expect(frag.textContent).toBe("xy");
});
