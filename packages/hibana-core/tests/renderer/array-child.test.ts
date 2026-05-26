import { expect, test } from "vite-plus/test";
import { Signal } from "../../src/reactivity/signal.ts";
import { flushSync } from "../../src/reactivity/scheduler.ts";
import { jsx } from "../../src/renderer/jsx.ts";

test("function child returning array<Node> mounts all items in order", () => {
  const items = new Signal([1, 2, 3]);
  const el = jsx("ul", {
    children: () =>
      items.value.map((n) => {
        const li = document.createElement("li");
        li.textContent = `item-${n}`;
        return li;
      }),
  }) as HTMLElement;

  // anchor (空 text) + 3 li
  expect(el.childNodes.length).toBe(4);
  expect(el.textContent).toBe("item-1item-2item-3");
});

test("array → array (length change) re-renders correctly", () => {
  const items = new Signal([1, 2]);
  const el = jsx("ul", {
    children: () =>
      items.value.map((n) => {
        const li = document.createElement("li");
        li.textContent = String(n);
        return li;
      }),
  }) as HTMLElement;

  expect(el.childNodes.length).toBe(3); // 2 li + anchor

  items.value = [10, 20, 30, 40];
  flushSync();
  expect(el.childNodes.length).toBe(5); // 4 li + anchor
  expect(el.textContent).toBe("10203040");

  items.value = [];
  flushSync();
  expect(el.childNodes.length).toBe(1); // anchor のみ
  expect(el.textContent).toBe("");
});

test("array → single Node 切替", () => {
  const showArray = new Signal(true);
  const el = jsx("div", {
    children: () => {
      if (showArray.value) {
        return [1, 2, 3].map((n) => {
          const s = document.createElement("span");
          s.textContent = String(n);
          return s;
        });
      }
      const p = document.createElement("p");
      p.textContent = "single";
      return p;
    },
  }) as HTMLElement;

  expect(el.childNodes.length).toBe(4); // 3 span + anchor
  expect(el.textContent).toBe("123");

  showArray.value = false;
  flushSync();
  expect(el.childNodes.length).toBe(1); // p のみ (anchor は消える)
  expect(el.textContent).toBe("single");
});

test("single Node → array 切替", () => {
  const showArray = new Signal(false);
  const el = jsx("div", {
    children: () => {
      if (showArray.value) {
        return [1, 2].map((n) => {
          const s = document.createElement("span");
          s.textContent = String(n);
          return s;
        });
      }
      const p = document.createElement("p");
      p.textContent = "init";
      return p;
    },
  }) as HTMLElement;

  expect(el.childNodes.length).toBe(1);
  expect(el.textContent).toBe("init");

  showArray.value = true;
  flushSync();
  expect(el.childNodes.length).toBe(3); // 2 span + anchor
  expect(el.textContent).toBe("12");
});

test("primitive → array 切替", () => {
  const mode = new Signal<"primitive" | "array">("primitive");
  const el = jsx("div", {
    children: () =>
      mode.value === "primitive"
        ? "hello"
        : [1, 2].map((n) => {
            const s = document.createElement("span");
            s.textContent = String(n);
            return s;
          }),
  }) as HTMLElement;

  expect(el.textContent).toBe("hello");

  mode.value = "array";
  flushSync();
  expect(el.childNodes.length).toBe(3);
  expect(el.textContent).toBe("12");

  mode.value = "primitive";
  flushSync();
  expect(el.textContent).toBe("hello");
});

test("array can contain primitives mixed with Nodes", () => {
  const items = new Signal<(string | Node)[]>([]);
  const el = jsx("div", { children: () => items.value }) as HTMLElement;

  const span = document.createElement("span");
  span.textContent = "X";
  items.value = ["a", span, "b"];
  flushSync();
  // anchor + 3 children
  expect(el.childNodes.length).toBe(4);
  expect(el.textContent).toBe("aXb");
});

test("nested array is flattened", () => {
  const data = new Signal([
    [1, 2],
    [3, [4, 5]],
  ]);
  const el = jsx("div", { children: () => data.value }) as HTMLElement;
  // anchor + 5 text nodes
  expect(el.childNodes.length).toBe(6);
  expect(el.textContent).toBe("12345");
});

test("null / undefined / false in array are skipped", () => {
  const items = new Signal<(number | null | undefined | boolean)[]>([
    1,
    null,
    2,
    undefined,
    3,
    false,
  ]);
  const el = jsx("div", { children: () => items.value }) as HTMLElement;
  expect(el.textContent).toBe("123");
});

test("static siblings around array reactive child are preserved", () => {
  const items = new Signal([1, 2]);
  const el = jsx("div", {
    children: ["before ", () => items.value, " after"],
  }) as HTMLElement;

  // before text + 2 number nodes + anchor + after text = 5
  expect(el.firstChild?.textContent).toBe("before ");
  expect(el.lastChild?.textContent).toBe(" after");
  expect(el.textContent).toBe("before 12 after");

  items.value = [10, 20, 30];
  flushSync();
  expect(el.firstChild?.textContent).toBe("before ");
  expect(el.lastChild?.textContent).toBe(" after");
  expect(el.textContent).toBe("before 102030 after");
});

test("integration: TodoList-style reactive add/remove", () => {
  const items = new Signal<{ id: number; text: string }[]>([
    { id: 1, text: "first" },
    { id: 2, text: "second" },
  ]);

  const el = jsx("ul", {
    children: () =>
      items.value.map((item) => {
        const li = document.createElement("li");
        li.dataset.id = String(item.id);
        li.textContent = item.text;
        return li;
      }),
  }) as HTMLElement;

  expect(el.querySelectorAll("li").length).toBe(2);

  // add
  items.value = [...items.value, { id: 3, text: "third" }];
  flushSync();
  expect(el.querySelectorAll("li").length).toBe(3);
  expect(el.textContent).toBe("firstsecondthird");

  // remove
  items.value = items.value.filter((i) => i.id !== 2);
  flushSync();
  expect(el.querySelectorAll("li").length).toBe(2);
  expect(el.textContent).toBe("firstthird");
});
