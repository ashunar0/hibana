import type { PluginObj } from "@babel/core";
import * as t from "@babel/types";
import { HBN_DO_MARKER } from "./transform-at-block.ts";
import { HBN_COMPONENT_MARKER } from "./transform-component.ts";

/**
 * Babel plugin: pre-processed Pattern 3 syntax を JS に降ろす。
 *
 * 入力 (transform-component 後):
 *   /* @hbn-component *\/ function Counter() {
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
 *   1. `@hbn-component` marker を持つ FunctionDeclaration の body 末尾を
 *      `autoReturn()` で do-block 化:
 *        - ExpressionStatement → ReturnStatement
 *        - BlockStatement → 内部末尾を再帰的に autoReturn
 *        - IfStatement → consequent / alternate を再帰的に autoReturn (T16-c)
 *      `component Foo() { ... }` 全体が do-block として振る舞う。
 *   2. `@hbn-do` marker を持つ ArrowFunctionExpression (= `@{ ... }` 由来) の
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
        if (!hasMarker(path.node, HBN_COMPONENT_MARKER)) return;

        promoteLast(path.node.body.body);
        stripMarker(path.node, HBN_COMPONENT_MARKER);
      },

      // `@{ ... }` 由来の block-body arrow function の末尾を do-block 化。
      // marker comment `@hbn-do` で transformAtBlock が生成した関数だけを対象にする
      // (ただの arrow function は触らない)。
      ArrowFunctionExpression(path) {
        if (!hasMarker(path.node, HBN_DO_MARKER)) return;

        const body = path.node.body;
        if (t.isBlockStatement(body)) {
          promoteLast(body.body);
        }
        stripMarker(path.node, HBN_DO_MARKER);
      },
    },
  };
}

// for-collect モード用の collector 変数名 (do-block 内の生成変数なので衝突しないよう
// 固定 reserved name、 ユーザコードでこの名前を使うことは想定しない)。
const COLLECT_VAR = "__hbn_out";

/** statement 列の最後を autoReturn で do-block 化 (in-place)。
 *  末尾が for / for-of / for-in の場合は「array collect モード」 に切替: body 内末尾の
 *  ExpressionStatement を `__hbn_out.push(...)` に書き換え、 stmts 全体を
 *  `const __hbn_out = []; ...; for(...){ ... push ... }; return __hbn_out;` に展開 (T23)。
 */
function promoteLast(stmts: t.Statement[]): void {
  if (stmts.length === 0) return;
  const last = stmts[stmts.length - 1];
  if (isForLike(last)) {
    promoteForCollect(stmts);
    return;
  }
  stmts[stmts.length - 1] = autoReturn(last);
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

type ForLike = t.ForStatement | t.ForOfStatement | t.ForInStatement;

function isForLike(stmt: t.Statement): stmt is ForLike {
  return t.isForStatement(stmt) || t.isForOfStatement(stmt) || t.isForInStatement(stmt);
}

/** for-collect モード: `for (X) <Item/>` の body を `__hbn_out.push(<Item/>)` に書き換え、
 *  stmts に collector の宣言と return を前後注入する (T23 `@{ for (...) <Item/> }`)。
 */
function promoteForCollect(stmts: t.Statement[]): void {
  const forStmt = stmts[stmts.length - 1] as ForLike;
  rewriteForBodyToPush(forStmt, COLLECT_VAR);
  stmts.unshift(makeCollectorDecl(COLLECT_VAR));
  stmts.push(t.returnStatement(t.identifier(COLLECT_VAR)));
}

function makeCollectorDecl(name: string): t.VariableDeclaration {
  return t.variableDeclaration("const", [
    t.variableDeclarator(t.identifier(name), t.arrayExpression([])),
  ]);
}

/** for の body 末尾の ExpressionStatement を `outName.push(expr)` に書き換える。
 *  - body が BlockStatement: 内部末尾の ExpressionStatement のみ push 化 (前段の statement は維持)
 *  - body 自体が ExpressionStatement (block なし): 全体を push に置き換え
 *  - それ以外 (空 / control flow のみ): 触らない (= 空 list が返る)
 */
function rewriteForBodyToPush(forStmt: ForLike, outName: string): void {
  const body = forStmt.body;
  if (t.isBlockStatement(body)) {
    if (body.body.length === 0) return;
    const lastIdx = body.body.length - 1;
    const last = body.body[lastIdx];
    if (t.isExpressionStatement(last)) {
      thunkifyIfJsx(last.expression);
      body.body[lastIdx] = makePushStatement(outName, last.expression);
    }
    return;
  }
  if (t.isExpressionStatement(body)) {
    thunkifyIfJsx(body.expression);
    forStmt.body = makePushStatement(outName, body.expression);
  }
}

function thunkifyIfJsx(expr: t.Expression): void {
  if (t.isJSXElement(expr) || t.isJSXFragment(expr)) thunkifyJsx(expr);
}

function makePushStatement(outName: string, expr: t.Expression): t.ExpressionStatement {
  return t.expressionStatement(
    t.callExpression(t.memberExpression(t.identifier(outName), t.identifier("push")), [expr]),
  );
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
