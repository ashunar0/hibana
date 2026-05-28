// analyzeInteractivity の判定確認: static / interactive 各 pattern

import { parse } from "@babel/parser";
import _traverse, { type TraverseOptions } from "@babel/traverse";
import type { Node } from "@babel/types";
import { describe, expect, it } from "vitest";
import {
  analyzeInteractivity,
  type InteractivityReport,
} from "../../src/extractor/analyze-interactivity.ts";
import { transformAtBlock } from "../../src/compiler/transform-at-block.ts";
import {
  HBN_COMPONENT_MARKER,
  transformComponent,
} from "../../src/compiler/transform-component.ts";

// oxlint-disable-next-line typescript/no-explicit-any -- Babel CJS interop の慣用句
const traverse = ((_traverse as any).default ?? _traverse) as (
  ast: Node,
  opts: TraverseOptions,
) => void;

// helper: hsx source から component を順に analyze
function analyzeAll(source: string): { name: string; report: InteractivityReport }[] {
  let code = transformComponent(source);
  code = transformAtBlock(code);
  const ast = parse(code, { sourceType: "module", plugins: ["jsx", "typescript"] });

  const results: { name: string; report: InteractivityReport }[] = [];
  traverse(ast, {
    FunctionDeclaration(path) {
      const fn = path.node;
      const hasMarker = fn.leadingComments?.some((c) => c.value.includes(HBN_COMPONENT_MARKER));
      if (!hasMarker || !fn.id) return;
      results.push({ name: fn.id.name, report: analyzeInteractivity(path) });
    },
  } satisfies TraverseOptions);
  return results;
}

describe("analyzeInteractivity", () => {
  it("純粋 static: JSX のみ、副作用なし、reactive read なし", () => {
    const source = `
      component Logo() {
        <img src="/logo.png" alt="logo" />
      }
    `;
    const [r] = analyzeAll(source);
    expect(r?.report.interactive).toBe(false);
    expect(r?.report.reasons).toEqual([]);
  });

  it("props.name の単純 member read は static 維持 (Greeting 相当)", () => {
    const source = `
      component Greeting(props) {
        <p>Hello, {props.name}!</p>
      }
    `;
    const [r] = analyzeAll(source);
    expect(r?.report.interactive).toBe(false);
  });

  it("destructured props も static", () => {
    const source = `
      component Header({ title, subtitle }) {
        <header><h1>{title}</h1><p>{subtitle}</p></header>
      }
    `;
    const [r] = analyzeAll(source);
    expect(r?.report.interactive).toBe(false);
  });

  it("event handler attribute で interactive", () => {
    const source = `
      component Btn() {
        <button onClick={() => alert("hi")}>click</button>
      }
    `;
    const [r] = analyzeAll(source);
    expect(r?.report.interactive).toBe(true);
    expect(r?.report.reasons).toContain("event handler: onClick");
  });

  it("signal write (assign) で interactive", () => {
    const source = `
      import { Signal } from "hibana-core";
      component Counter() {
        const count = new Signal(0);
        function inc() { count.value = count.value + 1; }
        <button>{inc}</button>
      }
    `;
    const [r] = analyzeAll(source);
    expect(r?.report.interactive).toBe(true);
    expect(r?.report.reasons.some((x) => x.startsWith("signal write"))).toBe(true);
  });

  it("signal write (++) で interactive", () => {
    const source = `
      import { Signal } from "hibana-core";
      component C() {
        const c = new Signal(0);
        function inc() { c.value++; }
        <div/>
      }
    `;
    const [r] = analyzeAll(source);
    expect(r?.report.interactive).toBe(true);
    expect(r?.report.reasons).toContain("signal write: *.value++");
  });

  it("JSX 内の *.value reactive read で interactive", () => {
    const source = `
      import { Signal } from "hibana-core";
      component Display() {
        const c = new Signal(0);
        <span>{c.value}</span>
      }
    `;
    const [r] = analyzeAll(source);
    expect(r?.report.interactive).toBe(true);
    expect(r?.report.reasons).toContain("reactive read: {...*.value...} in JSX");
  });

  it("onMount() / onCleanup() / effect() 呼び出しで interactive", () => {
    const source = `
      import { onMount, onCleanup, effect } from "hibana-core";
      component A() {
        onMount(() => console.log("mounted"));
        <div/>
      }
      component B() {
        onCleanup(() => console.log("cleanup"));
        <div/>
      }
      component E() {
        effect(() => console.log("effect"));
        <div/>
      }
    `;
    const results = analyzeAll(source);
    expect(results[0]?.report.reasons).toContain("lifecycle call: onMount()");
    expect(results[1]?.report.reasons).toContain("lifecycle call: onCleanup()");
    expect(results[2]?.report.reasons).toContain("lifecycle call: effect()");
  });

  it("new Resource / new Mutation で interactive", () => {
    const source = `
      import { Resource, Mutation } from "hibana-core";
      component Page() {
        const data = new Resource(async () => fetch("/api").then((r) => r.json()));
        const save = new Mutation(async (input) => fetch("/api", { method: "POST", body: input }));
        <div/>
      }
    `;
    const [r] = analyzeAll(source);
    expect(r?.report.interactive).toBe(true);
    expect(r?.report.reasons).toContain("reactive primitive: new Resource()");
    expect(r?.report.reasons).toContain("reactive primitive: new Mutation()");
  });

  it("complex Counter は全 reasons を集める", () => {
    const source = `
      import { Signal } from "hibana-core";
      component Counter() {
        const count = new Signal(0);
        <button onClick={() => count.value++}>Count: {count.value}</button>
      }
    `;
    const [r] = analyzeAll(source);
    expect(r?.report.interactive).toBe(true);
    expect(r?.report.reasons).toEqual(
      expect.arrayContaining([
        "event handler: onClick",
        "signal write: *.value++",
        "reactive read: {...*.value...} in JSX",
      ]),
    );
  });

  it("reasons は重複排除される", () => {
    const source = `
      component Multi() {
        <div>
          <button onClick={() => 1}/>
          <button onClick={() => 2}/>
        </div>
      }
    `;
    const [r] = analyzeAll(source);
    const onClickCount = r?.report.reasons.filter((x) => x === "event handler: onClick").length;
    expect(onClickCount).toBe(1);
  });
});
