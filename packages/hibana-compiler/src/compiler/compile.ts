import _generate, { type GeneratorOptions } from "@babel/generator";
import { parse } from "@babel/parser";
import _traverse, { type TraverseOptions } from "@babel/traverse";
import pattern3Plugin from "./plugin.ts";
import { transformAtBlock } from "./transform-at-block.ts";
import { transformComponent } from "./transform-component.ts";

// Babel パッケージの CJS interop: bundler によっては `.default` 経由でしか取れない
// (Solid / Vite plugin 等で同じ workaround を採用)。
// oxlint-disable typescript/no-explicit-any -- runtime interop の慣用句
const generate = ((_generate as any).default ?? _generate) as (
  ast: Parameters<typeof _generate>[0],
  options?: GeneratorOptions,
) => ReturnType<typeof _generate>;
const traverse = ((_traverse as any).default ?? _traverse) as typeof _traverse;
// oxlint-enable typescript/no-explicit-any

/**
 * Pattern 3 syntax (.tsx) を JS に compile する。
 *
 * パイプライン:
 *   1. transform-component (string): `component Foo(` →
 *      `/* @hbn-component *\/ function Foo(`
 *   2. transform-at-block (string): `@{ expr }` → `(() => expr)` (T16-MVP, 単一 expression)
 *   3. Babel parse + pattern3Plugin: marker 付き function の body 末尾を
 *      ReturnStatement に昇格 (do-block 化) + JSX 内 expression を thunk 化
 *   4. Babel generate: AST → JS string
 *
 * `(() => expr)` は ArrowFunctionExpression なので plugin の thunkify は二重 wrap しない
 * (shouldThunkify が ArrowFunction を除外する)。 JSX child / attribute として置かれた
 * `(() => expr)` は jsx runtime の signal binding (T9.6) で reactive Node-child 化される。
 */
export function compile(source: string): string {
  let code = transformComponent(source);
  code = transformAtBlock(code);

  const ast = parse(code, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
  });

  const plugin = pattern3Plugin();
  traverse(ast, plugin.visitor as TraverseOptions);

  return generate(ast).code;
}
