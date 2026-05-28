// @vitest-environment happy-dom

import { jsx } from "hibana-core/jsx-runtime";
import { expect, test } from "vite-plus/test";
import { registerIsland, renderIsland } from "../../src/ssr/index.ts";

test("renderIsland returns outerHTML of registered component", () => {
  registerIsland("RI1Counter", () => jsx("button", { children: "Count: 0" }));
  expect(renderIsland("RI1Counter")).toBe("<button>Count: 0</button>");
});

test("renderIsland passes props to component", () => {
  registerIsland("RI2Greeting", (props) =>
    jsx("p", { children: `Hello, ${(props as { name: string }).name}!` }),
  );
  expect(renderIsland("RI2Greeting", { name: "あさひ" })).toBe("<p>Hello, あさひ!</p>");
});

test("renderIsland returns empty string for unknown name", () => {
  expect(renderIsland("RI3Unknown")).toBe("");
});

test("renderIsland recurses into nested hbn-island placeholders", () => {
  registerIsland("RI4Child", () => jsx("span", { children: "child" }));
  registerIsland("RI4Parent", () =>
    jsx("div", { children: jsx("hbn-island", { name: "RI4Child" }) }),
  );
  expect(renderIsland("RI4Parent")).toBe(
    `<div><hbn-island name="RI4Child"><span>child</span></hbn-island></div>`,
  );
});

test("renderIsland threads serialized data-props through nested islands", () => {
  registerIsland("RI5Greeting", (props) =>
    jsx("p", { children: `Hello, ${(props as { name: string }).name}!` }),
  );
  registerIsland("RI5Page", () =>
    jsx("main", {
      children: jsx("hbn-island", {
        name: "RI5Greeting",
        "data-props": JSON.stringify({ name: "あさひ" }),
      }),
    }),
  );
  expect(renderIsland("RI5Page")).toBe(
    `<main><hbn-island name="RI5Greeting" data-props="{&quot;name&quot;:&quot;あさひ&quot;}"><p>Hello, あさひ!</p></hbn-island></main>`,
  );
});

test("renderIsland honors maxDepth and stops infinite recursion", () => {
  registerIsland("RI6Self", () =>
    jsx("section", { children: jsx("hbn-island", { name: "RI6Self" }) }),
  );
  const out = renderIsland("RI6Self", {}, { maxDepth: 2 });
  expect(out).toContain("<section>");
  expect(out.split("<section>").length - 1).toBe(3);
});
