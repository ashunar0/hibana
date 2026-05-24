import { expect, test, vi } from "vite-plus/test";
import { Fragment, jsx } from "../../src/renderer/jsx.ts";

test("creates an element with text child", () => {
  const el = jsx("button", null, "hello") as HTMLButtonElement;
  expect(el.tagName).toBe("BUTTON");
  expect(el.textContent).toBe("hello");
});

test("applies string attributes via setAttribute", () => {
  const el = jsx("input", { id: "name", placeholder: "type here" }, null) as HTMLInputElement;
  expect(el.getAttribute("id")).toBe("name");
  expect(el.getAttribute("placeholder")).toBe("type here");
});

test("className maps to class attribute", () => {
  const el = jsx("div", { className: "foo bar" }, null) as HTMLElement;
  expect(el.getAttribute("class")).toBe("foo bar");
});

test("boolean attribute true sets, false removes", () => {
  const a = jsx("button", { disabled: true }, null) as HTMLButtonElement;
  expect(a.hasAttribute("disabled")).toBe(true);

  const b = jsx("button", { disabled: false }, null) as HTMLButtonElement;
  expect(b.hasAttribute("disabled")).toBe(false);
});

test("null / undefined attribute is removed", () => {
  const el = jsx("div", { id: null, "data-x": undefined }, null) as HTMLElement;
  expect(el.hasAttribute("id")).toBe(false);
  expect(el.hasAttribute("data-x")).toBe(false);
});

test("style object is assigned to el.style", () => {
  const el = jsx("div", { style: { color: "red", fontSize: "12px" } }, null) as HTMLElement;
  expect(el.style.color).toBe("red");
  expect(el.style.fontSize).toBe("12px");
});

test("onClick attaches an event listener", () => {
  const handler = vi.fn();
  const el = jsx("button", { onClick: handler }, "click") as HTMLButtonElement;

  el.click();
  expect(handler).toHaveBeenCalledTimes(1);
});

test("multiple children append in order", () => {
  const el = jsx("p", null, "one", " ", "two") as HTMLElement;
  expect(el.textContent).toBe("one two");
});

test("nested array children are flattened", () => {
  const el = jsx("p", null, "a", ["b", ["c", "d"]], "e") as HTMLElement;
  expect(el.textContent).toBe("abcde");
});

test("null / undefined / boolean children are skipped", () => {
  const el = jsx("p", null, "a", null, undefined, false, true, "b") as HTMLElement;
  expect(el.textContent).toBe("ab");
});

test("number child becomes text node", () => {
  const el = jsx("span", null, 42) as HTMLElement;
  expect(el.textContent).toBe("42");
});

test("Node child is appended directly", () => {
  const inner = jsx("span", null, "child") as HTMLElement;
  const outer = jsx("div", null, inner) as HTMLElement;
  expect(outer.firstElementChild).toBe(inner);
});

test("component (function type) is invoked with children", () => {
  const MyButton = (props: Record<string, unknown>) =>
    jsx("button", { className: props.variant as string }, props.children as never);

  const el = jsx(MyButton, { variant: "primary" }, "click") as HTMLButtonElement;
  expect(el.tagName).toBe("BUTTON");
  expect(el.getAttribute("class")).toBe("primary");
  expect(el.textContent).toBe("click");
});

test("ref callback receives the element", () => {
  let captured: Element | null = null;
  const el = jsx("div", { ref: (e: Element) => (captured = e) }, null) as HTMLElement;
  expect(captured).toBe(el);
});

test("Fragment returns a DocumentFragment with children", () => {
  const frag = Fragment({ children: ["a", jsx("b", null, "bold"), "c"] }) as DocumentFragment;
  expect(frag.nodeType).toBe(11); // DOCUMENT_FRAGMENT_NODE
  expect(frag.childNodes.length).toBe(3);
  expect(frag.textContent).toBe("aboldc");
});
