// component が interactive か static かを AST walk で判定する。
// design.md §9「自動 island 検出」の核。
//
// interactive = 以下のいずれかを含む:
//   - JSX attribute `on[A-Z]*` (event handler)
//   - `*.value =` / `*.value++` (signal write)
//   - JSX 内 `{...*.value...}` (reactive read, rerender 必要)
//   - `effect()` / `onMount()` / `onCleanup()` 呼び出し
//   - `new Resource()` / `new Mutation()`
//
// static = 上記をいずれも含まない → JS 0 byte shipping

import type { NodePath } from "@babel/traverse";
import type { FunctionDeclaration } from "@babel/types";

const LIFECYCLE_CALLS = new Set(["effect", "onMount", "onCleanup"]);
const REACTIVE_CONSTRUCTORS = new Set(["Resource", "Mutation"]);

export interface InteractivityReport {
  interactive: boolean;
  reasons: string[];
}

export function analyzeInteractivity(path: NodePath<FunctionDeclaration>): InteractivityReport {
  const reasons: string[] = [];
  const push = (reason: string) => {
    if (!reasons.includes(reason)) reasons.push(reason);
  };

  path.traverse({
    JSXAttribute(p) {
      const name = p.node.name;
      if (name.type === "JSXIdentifier" && /^on[A-Z]/.test(name.name)) {
        push(`event handler: ${name.name}`);
      }
    },
    AssignmentExpression(p) {
      if (isDotValueMember(p.node.left)) {
        push(`signal write: *.value ${p.node.operator}`);
      }
    },
    UpdateExpression(p) {
      if (isDotValueMember(p.node.argument)) {
        push(`signal write: *.value${p.node.operator}`);
      }
    },
    JSXExpressionContainer(p) {
      let found = false;
      p.traverse({
        MemberExpression(inner) {
          if (!isDotValueMember(inner.node)) return;
          // assign の left / update の operand は signal write 側で拾うので除外
          const parent = inner.parent;
          if (parent.type === "AssignmentExpression" && parent.left === inner.node) return;
          if (parent.type === "UpdateExpression" && parent.argument === inner.node) return;
          found = true;
          inner.stop();
        },
      });
      if (found) push("reactive read: {...*.value...} in JSX");
    },
    CallExpression(p) {
      const callee = p.node.callee;
      if (callee.type === "Identifier" && LIFECYCLE_CALLS.has(callee.name)) {
        push(`lifecycle call: ${callee.name}()`);
      }
    },
    NewExpression(p) {
      const callee = p.node.callee;
      if (callee.type === "Identifier" && REACTIVE_CONSTRUCTORS.has(callee.name)) {
        push(`reactive primitive: new ${callee.name}()`);
      }
    },
  });

  return { interactive: reasons.length > 0, reasons };
}

// MemberExpression が `*.value` (non-computed) か判定
// oxlint-disable-next-line typescript/no-explicit-any -- Babel Node の union narrowing
function isDotValueMember(node: any): boolean {
  return (
    node?.type === "MemberExpression" &&
    !node.computed &&
    node.property?.type === "Identifier" &&
    node.property.name === "value"
  );
}
