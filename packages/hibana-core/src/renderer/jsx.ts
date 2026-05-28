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

  // signal binding: function child は effect 内で slot を更新。 dynamic slot は
  // **comment marker pair** で囲んで管理する (design.md §9 Solid 流 hydrate の土台)。
  //
  // - SSR で element の outerHTML を取ると marker comment は HTML に焼かれる
  //   (`<p>Hello, <!--$-->あさひ<!--/$-->!</p>`)。 client が innerHTML parse すると
  //   comment node はそのまま保持される。 hydrate モードはこの marker を anchor として
  //   「動的 slot の position」 を identify できる (B-2 で導入)。
  // - 既存挙動 (effect で reactive update) は完全保持: 単一 textNode は data 書き戻しで
  //   DOM churn 回避、 Node 切替は replaceChild、 array は marker 間に insertBefore で
  //   list rendering。
  //
  // 挙動: dynamic slot 1 個ごとに parent の childNodes が +2 (start marker + end marker)。
  if (typeof child === "function") {
    const startMark = document.createComment("");
    const endMark = document.createComment("");
    parent.appendChild(startMark);
    parent.appendChild(endMark);

    let currentSingle: Node | null = null;
    let currentArrayNodes: Node[] | null = null;

    effect(() => {
      const v = (child as () => unknown)();

      if (Array.isArray(v)) {
        // 既存 content を marker 間から除去 (single or 旧 array)
        if (currentSingle?.parentNode === parent) parent.removeChild(currentSingle);
        currentSingle = null;
        if (currentArrayNodes) {
          for (const n of currentArrayNodes) {
            if (n.parentNode === parent) parent.removeChild(n);
          }
        }
        currentArrayNodes = [];

        // flatten + 新 nodes を end marker の前に insert
        const flat = flattenArrayChild(v);
        for (const item of flat) {
          const node = toNode(item);
          parent.insertBefore(node, endMark);
          currentArrayNodes.push(node);
        }
        return;
      }

      // array → single 切替
      if (currentArrayNodes) {
        for (const n of currentArrayNodes) {
          if (n.parentNode === parent) parent.removeChild(n);
        }
        currentArrayNodes = null;
      }

      // 単一 path: 既存 textNode 書き戻し (DOM churn 回避)
      if (currentSingle?.nodeType === 3 /* TEXT_NODE */ && !(v instanceof Node)) {
        (currentSingle as Text).data = stringifyChild(v);
        return;
      }

      const next = toNode(v);
      if (currentSingle?.parentNode === parent) {
        parent.replaceChild(next, currentSingle);
      } else {
        parent.insertBefore(next, endMark);
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
