import type { PluginObj } from "@babel/core";
import * as t from "@babel/types";
import { HIB_RENDER_LABEL } from "./transform-render.ts";

/**
 * Babel plugin: pre-processed Pattern 3 syntax を JS に降ろす。
 *
 * 入力 (transform-component / transform-render 後):
 *   function Counter() {
 *     const count = new Signal(0)
 *     __HIB_RENDER__: {
 *       <button>Count: {count.value}</button>
 *     }
 *   }
 *
 * 出力:
 *   function Counter() {
 *     const count = new Signal(0)
 *     return <button>Count: {() => count.value}</button>
 *   }
 *
 * 変換ルール:
 *   1. `__HIB_RENDER__: { stmts; expr }` → `stmts; return expr` (LabeledStatement)
 *   2. render scope 内の JSX child expression を thunk 化:
 *      `{count.value}` → `{() => count.value}` (signal binding)
 *   3. render scope 内の JSX attribute expression も thunk 化、 ただし以下は例外:
 *      - `on*` event handler (`onClick={...}`) → そのまま (1 回 attach)
 *      - `ref={...}` → そのまま (callback ref)
 *      - 既に function literal (`{() => x}`) → そのまま (二重 thunk 化を避ける)
 *      - 静的 literal (`{42}`, `{"x"}`) → そのまま (reactive にする必要なし)
 */
export default function pattern3Plugin(): PluginObj {
  return {
    name: "hibana-pattern3",
    visitor: {
      LabeledStatement(path) {
        if (path.node.label.name !== HIB_RENDER_LABEL) return;

        const block = path.node.body;
        if (!t.isBlockStatement(block)) return;

        // block 内の最後の ExpressionStatement を return に変換、
        // 前の文 (setup 系) はそのまま残す
        const stmts = block.body;
        const last = stmts[stmts.length - 1];
        if (!t.isExpressionStatement(last)) {
          throw path.buildCodeFrameError("render { } の最後は JSX 式である必要があります");
        }

        // 最後の expression が JSX なら thunk 化を適用
        if (t.isJSXElement(last.expression) || t.isJSXFragment(last.expression)) {
          thunkifyJsx(last.expression);
        }

        path.replaceWithMultiple([...stmts.slice(0, -1), t.returnStatement(last.expression)]);
      },
    },
  };
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
