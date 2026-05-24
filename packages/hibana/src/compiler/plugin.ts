import type { PluginObj } from "@babel/core";
import * as t from "@babel/types";
import { HIB_COMPONENT_MARKER } from "./transform-component.ts";

/**
 * Babel plugin: pre-processed Pattern 3 syntax を JS に降ろす。
 *
 * 入力 (transform-component 後):
 *   /* @hib-component *\/ function Counter() {
 *     const count = new Signal(0)
 *     <button>Count: {count.value}</button>
 *   }
 *
 * 出力:
 *   function Counter() {
 *     const count = new Signal(0)
 *     return <button>Count: {() => count.value}</button>
 *   }
 *
 * 変換ルール:
 *   1. `@hib-component` marker を持つ FunctionDeclaration の body 末尾
 *      ExpressionStatement を ReturnStatement に昇格 (do-block 化)。
 *      `component Foo() { ... }` 全体が do-block として振る舞う。
 *   2. component scope 内の JSX child expression を thunk 化:
 *      `{count.value}` → `{() => count.value}` (signal binding)
 *   3. component scope 内の JSX attribute expression も thunk 化、 ただし以下は例外:
 *      - `on*` event handler (`onClick={...}`) → そのまま (1 回 attach)
 *      - `ref={...}` → そのまま (callback ref)
 *      - 既に function literal (`{() => x}`) → そのまま (二重 thunk 化を避ける)
 *      - 静的 literal (`{42}`, `{"x"}`) → そのまま (reactive にする必要なし)
 */
export default function pattern3Plugin(): PluginObj {
  return {
    name: "hibana-pattern3",
    visitor: {
      FunctionDeclaration(path) {
        if (!hasComponentMarker(path.node)) return;

        const body = path.node.body.body;
        if (body.length === 0) return;

        const last = body[body.length - 1];
        // 最後が ExpressionStatement なら return に昇格、 そうでない (return 等が既にある)
        // ならそのまま (do-block semantics: 最後の式が暗黙 return)
        if (t.isExpressionStatement(last)) {
          if (t.isJSXElement(last.expression) || t.isJSXFragment(last.expression)) {
            thunkifyJsx(last.expression);
          }
          body[body.length - 1] = t.returnStatement(last.expression);
        }

        // marker comment は出力に残したくないので除去
        stripComponentMarker(path.node);
      },
    },
  };
}

function hasComponentMarker(node: t.FunctionDeclaration): boolean {
  return node.leadingComments?.some((c) => c.value.includes(HIB_COMPONENT_MARKER)) ?? false;
}

function stripComponentMarker(node: t.FunctionDeclaration): void {
  if (!node.leadingComments) return;
  node.leadingComments = node.leadingComments.filter(
    (c) => !c.value.includes(HIB_COMPONENT_MARKER),
  );
  if (node.leadingComments.length === 0) {
    // Babel が空配列でも余計な空コメント枠を残すことがあるので null 化
    node.leadingComments = null;
  }
}

/** JSX tree の expression container を thunk 化する (再帰)。 */
function thunkifyJsx(node: t.JSXElement | t.JSXFragment): void {
  // children
  for (const child of node.children) {
    if (t.isJSXExpressionContainer(child)) {
      const expr = child.expression;
      if (shouldThunkify(expr)) {
        child.expression = wrapInThunk(expr);
      }
    } else if (t.isJSXElement(child) || t.isJSXFragment(child)) {
      thunkifyJsx(child);
    }
    // JSXText / JSXSpreadChild はそのまま
  }

  // attributes (JSXElement のみ)
  if (t.isJSXElement(node)) {
    for (const attr of node.openingElement.attributes) {
      if (!t.isJSXAttribute(attr)) continue; // JSXSpreadAttribute は skip
      const name = attr.name;
      if (!t.isJSXIdentifier(name)) continue;
      if (isEventOrRefAttr(name.name)) continue;

      const value = attr.value;
      if (!t.isJSXExpressionContainer(value)) continue;

      const expr = value.expression;
      if (shouldThunkify(expr)) {
        value.expression = wrapInThunk(expr);
      }
    }
  }
}

function isEventOrRefAttr(name: string): boolean {
  return name === "ref" || (name.startsWith("on") && name.length > 2);
}

/**
 * thunk 化すべき expression かを判定。
 * - 既に function literal (`() => ...`, `function() {}`) → false (二重 thunk 防止)
 * - 静的 literal (`42`, `"x"`, `true`, `null`) → false (reactive 不要)
 * - identifier (`foo`) → false (signal access ではないと仮定、 過剰 thunk 防止)
 * - それ以外 (`a.b`, `f()`, `a + b`, `cond ? x : y`) → true (signal access の可能性あり)
 */
function shouldThunkify(expr: t.Expression | t.JSXEmptyExpression): boolean {
  if (t.isJSXEmptyExpression(expr)) return false;
  if (t.isArrowFunctionExpression(expr) || t.isFunctionExpression(expr)) {
    return false;
  }
  if (
    t.isStringLiteral(expr) ||
    t.isNumericLiteral(expr) ||
    t.isBooleanLiteral(expr) ||
    t.isNullLiteral(expr) ||
    t.isTemplateLiteral(expr) ||
    t.isBigIntLiteral(expr)
  ) {
    return false;
  }
  if (t.isIdentifier(expr)) return false;
  return true;
}

function wrapInThunk(expr: t.Expression | t.JSXEmptyExpression): t.Expression {
  // JSXEmptyExpression は shouldThunkify で除外済みだが型ガード
  if (t.isJSXEmptyExpression(expr)) return t.nullLiteral();
  return t.arrowFunctionExpression([], expr);
}
