import type { PluginObj } from "@babel/core";
import * as t from "@babel/types";
import { HIB_DO_MARKER } from "./transform-at-block.ts";
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
 *   1. `@hib-component` marker を持つ FunctionDeclaration の body 末尾を
 *      `autoReturn()` で do-block 化:
 *        - ExpressionStatement → ReturnStatement
 *        - BlockStatement → 内部末尾を再帰的に autoReturn
 *        - IfStatement → consequent / alternate を再帰的に autoReturn (T16-c)
 *      `component Foo() { ... }` 全体が do-block として振る舞う。
 *   2. `@hib-do` marker を持つ ArrowFunctionExpression (= `@{ ... }` 由来) の
 *      body 末尾も同じ `autoReturn()` で処理 (T16-b / T16-c)。
 *   3. component scope / do-block scope 内の JSX child expression を thunk 化:
 *      `{count.value}` → `{() => count.value}` (signal binding)
 *   4. JSX attribute expression も thunk 化、 ただし以下は例外:
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
        if (!hasMarker(path.node, HIB_COMPONENT_MARKER)) return;

        promoteLast(path.node.body.body);
        stripMarker(path.node, HIB_COMPONENT_MARKER);
      },

      // `@{ ... }` 由来の block-body arrow function の末尾を do-block 化。
      // marker comment `@hib-do` で transformAtBlock が生成した関数だけを対象にする
      // (ただの arrow function は触らない)。
      ArrowFunctionExpression(path) {
        if (!hasMarker(path.node, HIB_DO_MARKER)) return;

        const body = path.node.body;
        if (t.isBlockStatement(body)) {
          promoteLast(body.body);
        }
        stripMarker(path.node, HIB_DO_MARKER);
      },
    },
  };
}

/** statement 列の最後を autoReturn で do-block 化 (in-place)。 */
function promoteLast(stmts: t.Statement[]): void {
  if (stmts.length === 0) return;
  stmts[stmts.length - 1] = autoReturn(stmts[stmts.length - 1]);
}

/**
 * do-block の暗黙 return semantics を AST に適用する (再帰)。
 *   - ExpressionStatement: ReturnStatement に昇格 (末尾が JSX なら thunkifyJsx も)
 *   - BlockStatement: 内部末尾に再帰
 *   - IfStatement: consequent / alternate それぞれに再帰 (T16-c: `if-else` を expression として扱う)
 *   - その他 (ReturnStatement / VariableDeclaration / etc.): そのまま (暗黙 return しない)
 */
function autoReturn(stmt: t.Statement): t.Statement {
  if (t.isExpressionStatement(stmt)) {
    if (t.isJSXElement(stmt.expression) || t.isJSXFragment(stmt.expression)) {
      thunkifyJsx(stmt.expression);
    }
    return t.returnStatement(stmt.expression);
  }
  if (t.isBlockStatement(stmt)) {
    promoteLast(stmt.body);
    return stmt;
  }
  if (t.isIfStatement(stmt)) {
    stmt.consequent = autoReturn(stmt.consequent);
    if (stmt.alternate) {
      stmt.alternate = autoReturn(stmt.alternate);
    }
    return stmt;
  }
  return stmt;
}

type Markable = t.FunctionDeclaration | t.ArrowFunctionExpression;

function hasMarker(node: Markable, marker: string): boolean {
  // leadingComments / innerComments の両方を確認 (ParenthesizedExpression 内の
  // arrow function には innerComments として attach されることがある)
  const all = [...(node.leadingComments ?? []), ...(node.innerComments ?? [])];
  return all.some((c) => c.value.includes(marker));
}

function stripMarker(node: Markable, marker: string): void {
  for (const key of ["leadingComments", "innerComments"] as const) {
    const list = node[key];
    if (!list) continue;
    const filtered = list.filter((c) => !c.value.includes(marker));
    node[key] = filtered.length === 0 ? null : filtered;
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
