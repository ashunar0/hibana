// intrinsic element (lowercase tag) で children に JSX element を含む場合、 children を
// `{() => [...children]}` の lazy thunk で wrap する。
//
// 動機 (hydrate モードの eval order 問題):
//   JS の引数評価規則により `jsx("main", { children: [jsx("h1"), jsx("Counter")] })` の
//   内側 jsx 呼び出しは外側より **先に** evaluate される。 hydrate モードでは外側 jsx で
//   cursor を <main> → <main>.firstChild に切替えてから内側 jsx を呼びたい (DFS walker) が、
//   eager eval なので cursor が <main> のまま内側が呼ばれて tag mismatch → 新規 createElement
//   → 二重化。
//
// この transform で children を thunk 化すると、 jsx runtime の function child path
// (signal binding と同じ marker + effect 機構) を経由する。 effect は同期実行で、 外側
// jsx 呼び出しで cursor 切替後に thunk が call される → 内側 jsx は新しい cursor で動く。
//
// 対象範囲:
//   - intrinsic tag (lowercase or 数字始まり) のみ。 PascalCase は per-component 島化で
//     `<hbn-island/>` に書き換わってから来るので、 そっちが intrinsic 扱いで lazy 化される
//   - children に JSX element / Fragment が含まれる場合のみ (static text や signal binding
//     の expression container のみは lazy 化不要、 eval order 問題が出ない)
//
// 実行順序: pattern3Plugin (thunkify) → islandPlugin (PascalCase 書換) → 本 plugin。
// pattern3Plugin より後に走らせるのは、 thunkify 済みの `{() => signal.value}` を含む
// children を lazy 配列に巻き込むため (順序逆だと内側 signal binding が thunkify されない)。

import type { PluginObj } from "@babel/core";
import * as t from "@babel/types";

export default function lazyChildrenPlugin(): PluginObj {
  return {
    name: "hibana-lazy-children",
    visitor: {
      JSXElement(path) {
        const opening = path.node.openingElement;
        const name = opening.name;
        if (!t.isJSXIdentifier(name)) return;
        const first = name.name[0];
        if (!first) return;
        // PascalCase (component) は対象外 - islandPlugin で `<hbn-island/>` に書き換わる
        if (first >= "A" && first <= "Z") return;

        const children = path.node.children;
        if (children.length === 0) return;

        // 内側に jsx element / fragment が無いなら lazy 化不要 (eval order 問題が出ない)
        const hasJsxChild = children.some((c) => t.isJSXElement(c) || t.isJSXFragment(c));
        if (!hasJsxChild) return;

        // children を array element に変換
        const arrayElements: t.Expression[] = [];
        for (const child of children) {
          if (t.isJSXText(child)) {
            // whitespace のみは捨てる (JSX の慣習、 ぶら下がりの改行・インデント)
            if (child.value.trim() === "") continue;
            arrayElements.push(t.stringLiteral(child.value));
          } else if (t.isJSXExpressionContainer(child)) {
            if (!t.isJSXEmptyExpression(child.expression)) {
              arrayElements.push(child.expression);
            }
          } else if (t.isJSXSpreadChild(child)) {
            // spread は spread element として残す
            arrayElements.push(t.spreadElement(child.expression) as unknown as t.Expression);
          } else if (t.isJSXElement(child) || t.isJSXFragment(child)) {
            arrayElements.push(child);
          }
        }

        // `Object.assign(() => [...], { _hbnLazy: true })` で生成する。
        // _hbnLazy marker を function に attach し、 jsx runtime で signal binding
        // (function child = primitive 返す reactive thunk) と区別する。 lazy children
        // は markers なし + 1 回 eval + 結果 array を appendChild で配置 (= static layout)、
        // hydrate モードでは内側 jsx が cursor 経由で既存 DOM を採用する。
        const arrow = t.arrowFunctionExpression([], t.arrayExpression(arrayElements));
        const wrapped = t.callExpression(
          t.memberExpression(t.identifier("Object"), t.identifier("assign")),
          [
            arrow,
            t.objectExpression([
              t.objectProperty(t.identifier("_hbnLazy"), t.booleanLiteral(true)),
            ]),
          ],
        );
        path.node.children = [t.jsxExpressionContainer(wrapped)];
        opening.selfClosing = false;
        if (!path.node.closingElement) {
          path.node.closingElement = t.jsxClosingElement(t.cloneNode(name));
        }
      },
    },
  };
}
