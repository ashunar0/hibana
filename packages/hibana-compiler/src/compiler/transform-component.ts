// `component Foo(...) { ... }` を `function Foo(...) { ... }` に置換する pre-process。
// Babel parser は `component` キーワードを解釈できないので、parser 投入前に str transform で潰す。
// [A-Z] 始まりに限定して `const component = 1` 等を誤置換しないようにする
// (Pattern 3 component は React 慣習に倣って PascalCase 必須)。
//
// `/* @hbn-component */` の leading comment を付けることで plugin 側が「これは
// component 由来の function」 と識別でき、 body 末尾を do-block 的に return に
// 昇格する処理 (T15.6) を適用できる。 ただの helper function は誤変換しない。
//
// `export component` / `export default component` も認識する (optional prefix を
// regex で保持して置換後の出力に持ち越す)。 Babel AST 上では
// `ExportNamedDeclaration.declaration` / `ExportDefaultDeclaration.declaration` の
// 中に FunctionDeclaration が居る形になるが、 traverse は深さ問わず walk するので
// marker 識別ロジックはそのまま動く。
export const HBN_COMPONENT_MARKER = "@hbn-component";
const COMPONENT_RE = /\b(export\s+(?:default\s+)?)?component\s+([A-Z]\w*)\s*\(/g;

export function transformComponent(source: string): string {
  return source.replace(COMPONENT_RE, (_, exportPrefix: string | undefined, name: string) => {
    return `${exportPrefix ?? ""}/* ${HBN_COMPONENT_MARKER} */ function ${name}(`;
  });
}
