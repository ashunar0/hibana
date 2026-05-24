// `component Foo(...) { ... }` を `function Foo(...) { ... }` に置換する pre-process。
// Babel parser は `component` キーワードを解釈できないので、parser 投入前に str transform で潰す。
// [A-Z] 始まりに限定して `const component = 1` 等を誤置換しないようにする
// (Pattern 3 component は React 慣習に倣って PascalCase 必須)。
//
// `/* @hib-component */` の leading comment を付けることで plugin 側が「これは
// component 由来の function」 と識別でき、 body 末尾を do-block 的に return に
// 昇格する処理 (T15.6) を適用できる。 ただの helper function は誤変換しない。
export const HIB_COMPONENT_MARKER = "@hib-component";
const COMPONENT_RE = /\bcomponent\s+([A-Z]\w*)\s*\(/g;

export function transformComponent(source: string): string {
  return source.replace(COMPONENT_RE, `/* ${HIB_COMPONENT_MARKER} */ function $1(`);
}
