import { effect } from "../reactivity/effect.ts";

export type Child =
  | Node
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly Child[]
  | (() => unknown);

export type Props = (Record<string, unknown> & { children?: Child }) | null | undefined;

export type Component = (props: Record<string, unknown>) => Node;

/**
 * JSX runtime (React automatic runtime spec)。
 * - `type`: 文字列なら DOM 要素、関数なら component / Fragment
 * - `props`: children は props.children 内
 * - `_key`: list rendering の key、 MVP では無視
 */
export function jsx(type: string | Component, props: Props, _key?: unknown): Node {
  if (typeof type === "function") {
    return type(props ?? {});
  }

  const el = document.createElement(type);

  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (key === "children") continue;
      applyProp(el, key, value);
    }
    appendChild(el, props.children as Child);
  }

  return el;
}

// jsxs: children が静的 array の場合に呼ばれる variant。 MVP では jsx と同じ実装
export const jsxs = jsx;

export function Fragment(props: { children?: Child } | undefined): Node {
  const frag = document.createDocumentFragment();
  if (props) appendChild(frag, props.children as Child);
  return frag;
}

function applyProp(el: Element, key: string, value: unknown): void {
  if (key.startsWith("on") && typeof value === "function") {
    el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    return;
  }

  if (key === "ref" && typeof value === "function") {
    (value as (el: Element) => void)(el);
    return;
  }

  // signal binding: function value は effect で wrap
  if (typeof value === "function") {
    effect(() => setAttr(el, key, (value as () => unknown)()));
    return;
  }

  setAttr(el, key, value);
}

function setAttr(el: Element, key: string, value: unknown): void {
  if (key === "style" && typeof value === "object" && value !== null) {
    Object.assign((el as HTMLElement).style, value);
    return;
  }

  if (key === "className") {
    el.setAttribute("class", String(value));
    return;
  }

  if (typeof value === "boolean") {
    if (value) el.setAttribute(key, "");
    else el.removeAttribute(key);
    return;
  }

  if (value == null) {
    el.removeAttribute(key);
    return;
  }

  // oxlint-disable-next-line typescript/no-base-to-string -- JSX runtime はユーザの任意値を attribute 文字列化する責務
  el.setAttribute(key, String(value));
}

function appendChild(parent: Node, child: Child): void {
  if (child == null || typeof child === "boolean") return;

  if (Array.isArray(child)) {
    for (const c of child) appendChild(parent, c);
    return;
  }

  if (child instanceof Node) {
    parent.appendChild(child);
    return;
  }

  // signal binding: function child は text node を 1 個作って effect で更新
  if (typeof child === "function") {
    const textNode = document.createTextNode("");
    parent.appendChild(textNode);
    effect(() => {
      const v = (child as () => unknown)();
      textNode.data = stringifyChild(v);
    });
    return;
  }

  parent.appendChild(document.createTextNode(stringifyChild(child)));
}

function stringifyChild(value: unknown): string {
  if (value == null || typeof value === "boolean") return "";
  // oxlint-disable-next-line typescript/no-base-to-string -- JSX runtime はユーザの任意値を text node 化する責務
  return String(value);
}
