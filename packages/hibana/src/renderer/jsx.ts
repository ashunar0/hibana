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

// DOM property (setAttribute では反映されない) を直接代入する key 一覧。
// controlled input 用 (T9.8): input.value / checkbox.checked / option.selected / input.indeterminate
const DOM_PROPERTY_KEYS = new Set(["value", "checked", "selected", "indeterminate"]);

function applyProp(el: Element, key: string, value: unknown): void {
  if (key.startsWith("on") && typeof value === "function") {
    el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    return;
  }

  if (key === "ref" && typeof value === "function") {
    (value as (el: Element) => void)(el);
    return;
  }

  // T9.8: input/checkbox 等の controlled input は DOM property に直接書く
  // (setAttribute("value", ...) は initial value attribute だけ反映されて
  //  user 入力後の .value property は変化しないので、 controlled にならない)
  if (DOM_PROPERTY_KEYS.has(key)) {
    if (typeof value === "function") {
      effect(() => setDomProperty(el, key, (value as () => unknown)()));
    } else {
      setDomProperty(el, key, value);
    }
    return;
  }

  // signal binding: function value は effect で wrap
  if (typeof value === "function") {
    effect(() => setAttr(el, key, (value as () => unknown)()));
    return;
  }

  setAttr(el, key, value);
}

function setDomProperty(el: Element, key: string, value: unknown): void {
  (el as unknown as Record<string, unknown>)[key] = value ?? "";
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

  // signal binding: function child は effect 内で slot を更新
  // - return が Node → replaceChild で差し替え (Show 相当の DOM 切替、 childNodes.length 不変)
  // - return が primitive → text node を 1 個維持して data 更新 (DOM churn 回避)
  // - return が array → anchor (空 text node) + nodes 群を anchor の前に insert
  //   (T9.7: list rendering 対応、 keyed diff なしの naive replace、 keyed は Phase 2)
  if (typeof child === "function") {
    let currentSingle: Node | null = null;
    let currentArray: { anchor: Text; nodes: Node[] } | null = null;

    effect(() => {
      const v = (child as () => unknown)();

      if (Array.isArray(v)) {
        // anchor 方式に切替 or 維持
        if (currentSingle) {
          const anchor = document.createTextNode("");
          parent.replaceChild(anchor, currentSingle);
          currentSingle = null;
          currentArray = { anchor, nodes: [] };
        } else if (!currentArray) {
          const anchor = document.createTextNode("");
          parent.appendChild(anchor);
          currentArray = { anchor, nodes: [] };
        }

        // 旧 nodes を remove
        for (const n of currentArray.nodes) {
          if (n.parentNode === parent) parent.removeChild(n);
        }
        currentArray.nodes = [];

        // flatten + 新 nodes を anchor の前に insert
        const flat = flattenArrayChild(v);
        for (const item of flat) {
          const node = toNode(item);
          parent.insertBefore(node, currentArray.anchor);
          currentArray.nodes.push(node);
        }
        return;
      }

      // array → single 切替
      if (currentArray) {
        for (const n of currentArray.nodes) {
          if (n.parentNode === parent) parent.removeChild(n);
        }
        const next = toNode(v);
        parent.replaceChild(next, currentArray.anchor);
        currentArray = null;
        currentSingle = next;
        return;
      }

      // 単一 path (既存最適化)
      if (currentSingle?.nodeType === 3 /* TEXT_NODE */ && !(v instanceof Node)) {
        (currentSingle as Text).data = stringifyChild(v);
        return;
      }

      const next = toNode(v);
      if (currentSingle?.parentNode === parent) {
        parent.replaceChild(next, currentSingle);
      } else {
        parent.appendChild(next);
      }
      currentSingle = next;
    });
    return;
  }

  parent.appendChild(document.createTextNode(stringifyChild(child)));
}

function flattenArrayChild(arr: readonly unknown[]): unknown[] {
  const out: unknown[] = [];
  for (const item of arr) {
    if (Array.isArray(item)) out.push(...flattenArrayChild(item));
    else if (item != null && typeof item !== "boolean") out.push(item);
  }
  return out;
}

function toNode(value: unknown): Node {
  if (value == null || typeof value === "boolean") return document.createTextNode("");
  if (value instanceof Node) return value;
  return document.createTextNode(stringifyChild(value));
}

function stringifyChild(value: unknown): string {
  if (value == null || typeof value === "boolean") return "";
  // oxlint-disable-next-line typescript/no-base-to-string -- JSX runtime はユーザの任意値を text node 化する責務
  return String(value);
}
