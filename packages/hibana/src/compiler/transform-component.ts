// `component Foo(...) { ... }` を `function Foo(...) { ... }` に置換する pre-process。
// Babel parser は `component` キーワードを解釈できないので、parser 投入前に str transform で潰す。
// [A-Z] 始まりに限定して `const component = 1` 等を誤置換しないようにする
// (Pattern 3 component は React 慣習に倣って PascalCase 必須)。
const COMPONENT_RE = /\bcomponent\s+([A-Z]\w*)\s*\(/g;

export function transformComponent(source: string): string {
  return source.replace(COMPONENT_RE, "function $1(");
}
