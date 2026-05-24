import { effect } from "../reactivity/effect.ts";

export type Child =
  | Node
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly Child[]
  | (() => unknown); // signal binding (text 位置)

export type Props = Record<string, unknown> | null;

export type Component = (props: Record<string, unknown>) => Node;

export function jsx(type: string | Component, props: Props, ...children: Child[]): Node {
  if (typeof type === "function") {
    return type({ ...props, children });
  }

  const el = document.createElement(type);

  if (props) {
    for (const [key, value] of Object.entries(props)) {
      applyProp(el, key, value);
    }
  }

  appendChildren(el, children);
  return el;
}

export function Fragment(props: { children: Child[] }): Node {
  const frag = document.createDocumentFragment();
  appendChildren(frag, props.children);
  return frag;
}

function applyProp(el: Element, key: string, value: unknown): void {
  if (key === "children") return;

  // onClick → "click" 等。event handler は signal binding 対象外 (1 回 attach)
  if (key.startsWith("on") && typeof value === "function") {
    el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    return;
  }

  // ref callback (§8: Solid 流)
  if (key === "ref" && typeof value === "function") {
    (value as (el: Element) => void)(el);
    return;
  }

  // 上記以外の function は signal getter として扱う → effect で wrap
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

function appendChildren(parent: Node, children: readonly Child[]): void {
  for (const child of children) appendChild(parent, child);
}

function appendChild(parent: Node, child: Child): void {
  if (child == null || typeof child === "boolean") return;

  if (Array.isArray(child)) {
    appendChildren(parent, child);
    return;
  }

  if (child instanceof Node) {
    parent.appendChild(child);
    return;
  }

  // signal binding: function child は text node を 1 個作って effect で更新
  // Node を返す reactive child (Show 相当) は Phase 2 で対応
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
