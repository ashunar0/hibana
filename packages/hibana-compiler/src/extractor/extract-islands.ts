// hsx ソースから `component` 宣言を抽出する。
// design.md §2.1「component keyword の構造的含意」の核 —
// AST walk 一発で UI primitive 候補を集められる。
//
// Island 自動抽出 (per-island chunk / SSR placeholder injection / client hydrate)
// の基盤として vite-plugin から呼ばれる。

import { parse } from "@babel/parser";
import _traverse, { type TraverseOptions } from "@babel/traverse";
import { transformAtBlock } from "../compiler/transform-at-block.ts";
import { HBN_COMPONENT_MARKER, transformComponent } from "../compiler/transform-component.ts";
import { analyzeInteractivity } from "./analyze-interactivity.ts";

// oxlint-disable-next-line typescript/no-explicit-any -- Babel CJS interop の慣用句
const traverse = ((_traverse as any).default ?? _traverse) as typeof _traverse;

export interface IslandInfo {
  name: string;
  line: number;
  props: string[];
  interactive: boolean;
  reasons: string[];
}

export function extractIslands(source: string): IslandInfo[] {
  let code = transformComponent(source);
  code = transformAtBlock(code);

  const ast = parse(code, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
  });

  const islands: IslandInfo[] = [];

  traverse(ast, {
    FunctionDeclaration(path) {
      const fn = path.node;
      const hasMarker = fn.leadingComments?.some((c) => c.value.includes(HBN_COMPONENT_MARKER));
      if (!hasMarker || !fn.id) return;

      const props: string[] = [];
      for (const param of fn.params) {
        if (param.type === "Identifier") {
          props.push(param.name);
        } else if (param.type === "ObjectPattern") {
          for (const prop of param.properties) {
            if (prop.type === "ObjectProperty" && prop.key.type === "Identifier") {
              props.push(prop.key.name);
            } else if (prop.type === "RestElement" && prop.argument.type === "Identifier") {
              props.push(`...${prop.argument.name}`);
            }
          }
        }
      }

      const { interactive, reasons } = analyzeInteractivity(path);

      islands.push({
        name: fn.id.name,
        line: fn.loc?.start.line ?? -1,
        props,
        interactive,
        reasons,
      });
    },
  } satisfies TraverseOptions);

  return islands;
}

export function formatIslands(islands: IslandInfo[], label: string): string {
  const lines = [`Found ${islands.length} components in ${label}:`];
  for (const i of islands) {
    const propsLabel =
      i.props.length === 0 ? "0 props" : `${i.props.length} props: ${i.props.join(", ")}`;
    const kind = i.interactive ? "client" : "static";
    lines.push(`  - ${i.name} [${kind}] (line ${i.line}, ${propsLabel})`);
    if (i.interactive) {
      for (const reason of i.reasons) lines.push(`      ${reason}`);
    }
  }
  return lines.join("\n");
}
