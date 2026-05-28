// JSX 内の `<PascalCase/>` (= component element) を
// `<hbn-island name="X" data-props='{"k":"v",...}'/>` に書き換える Babel plugin。
//
// 目的: parent component の chunk から子 island の参照を外し、 真の
// per-island code splitting (mount loader が manifest 経由で on-demand fetch) を
// 成立させる。 これが無いと App.tsx の bundle に Counter / Greeting の実装が
// inline で巻き込まれ、 per-island chunk が emit されても誰も使わない死荷重になる。
//
// スコープ (最小):
//   - self-closing or 空白のみの children を持つ PascalCase JSXElement のみ島化
//   - attribute は static literal (string / number / boolean / null) のみ data-props に serialize
//   - dynamic attribute (`{signal.value}` 等) は drop。 将来 serializable signal で復活させる
//   - children 持ち (`<Counter><p/></Counter>`) は触らない (slot 機能は Phase 後)
//   - intrinsic tag (`<button/>` 等) は触らない (JSXIdentifier の先頭が大文字でない判定)

import type { PluginObj } from "@babel/core";
import * as t from "@babel/types";

export default function islandPlugin(): PluginObj {
  return {
    name: "hibana-island",
    visitor: {
      JSXElement(path) {
        const opening = path.node.openingElement;
        const tagName = opening.name;
        if (!t.isJSXIdentifier(tagName)) return; // member / namespaced は intrinsic 扱い
        const first = tagName.name[0];
        if (!first || first < "A" || first > "Z") return; // 大文字始まりのみ
        if (tagName.name === "Fragment") return; // jsx runtime primitive は除外

        // children 持ち (whitespace 以外) は slot 機能未対応なので島化しない
        const hasRealChildren = path.node.children.some((c) => !isWhitespaceJsxText(c));
        if (hasRealChildren) return;

        const islandName = tagName.name;
        const propsRecord: Record<string, string | number | boolean | null> = {};

        for (const attr of opening.attributes) {
          if (!t.isJSXAttribute(attr)) continue; // spread は drop (動的)
          const attrName = attr.name;
          if (!t.isJSXIdentifier(attrName)) continue;

          const serialized = serializeAttrValue(attr.value);
          if (serialized === undefined) continue; // dynamic は drop
          propsRecord[attrName.name] = serialized;
        }

        const newAttrs: t.JSXAttribute[] = [
          t.jsxAttribute(t.jsxIdentifier("name"), t.stringLiteral(islandName)),
        ];
        if (Object.keys(propsRecord).length > 0) {
          // JSX attribute value は JSXExpressionContainer 経由で渡す。 `"..."` 直書きだと
          // 非 ASCII char (例: 日本語) が Babel generator により `\uXXXX` 形式で出力される
          // が、 JSX/HTML attribute value spec 上 unicode escape は無効で、 Rolldown の
          // JSX parser が `Invalid Unicode escape sequence` で fail する。
          // `{"..."}` 形式なら JS string literal 規則がそのまま使え、 jsx runtime は
          // string として attribute に渡す (mountIslands 側で JSON.parse する)。
          newAttrs.push(
            t.jsxAttribute(
              t.jsxIdentifier("data-props"),
              t.jsxExpressionContainer(t.stringLiteral(JSON.stringify(propsRecord))),
            ),
          );
        }

        path.node.openingElement = t.jsxOpeningElement(
          t.jsxIdentifier("hbn-island"),
          newAttrs,
          true,
        );
        path.node.closingElement = null;
        path.node.children = [];
      },
    },
  };
}

function isWhitespaceJsxText(node: t.Node): boolean {
  return t.isJSXText(node) && node.value.trim() === "";
}

function serializeAttrValue(
  value: t.JSXAttribute["value"],
): string | number | boolean | null | undefined {
  if (value === null || value === undefined) return true; // boolean attr `<X flag/>`
  if (t.isStringLiteral(value)) return value.value;
  if (t.isJSXExpressionContainer(value)) {
    const expr = value.expression;
    if (t.isStringLiteral(expr)) return expr.value;
    if (t.isNumericLiteral(expr)) return expr.value;
    if (t.isBooleanLiteral(expr)) return expr.value;
    if (t.isNullLiteral(expr)) return null;
    // 負数 (`{-1}`) は UnaryExpression なので literal 判定漏れる、 ここでは drop。
    // 必要なら将来対応。
  }
  return undefined;
}
