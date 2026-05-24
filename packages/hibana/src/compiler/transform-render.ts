// `render { ... }` は valid JS ではないので Babel parser を通せない。
// pre-process で labeled statement (`__HIB_RENDER__: { ... }`) に変換することで
// parse 可能にし、 Babel plugin 側で return statement に書き換える。
export const HIB_RENDER_LABEL = "__HIB_RENDER__";

// `obj.render { }` (member access) を防ぐため、直前に `.` や word char がないことを要求
const RENDER_RE = /(?<![.\w])render\s*\{/g;

export function transformRender(source: string): string {
  return source.replace(RENDER_RE, `${HIB_RENDER_LABEL}: {`);
}
