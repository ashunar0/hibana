// TS automatic runtime entry: tsconfig の `jsxImportSource: "hibana"` で参照される。
// React 17+ spec に従って jsx / jsxs / Fragment を export。
export { Fragment, jsx, jsxs } from "./renderer/jsx.ts";

import type { Child } from "./renderer/jsx.ts";

export namespace JSX {
  // MVP: 全 intrinsic element を受け入れる。 個別 element の型は Phase 2 で
  export interface IntrinsicElements {
    // oxlint-disable-next-line typescript/no-explicit-any -- MVP の wildcard
    [elemName: string]: any;
  }

  export type Element = Node;

  export interface ElementChildrenAttribute {
    children: Child;
  }
}
