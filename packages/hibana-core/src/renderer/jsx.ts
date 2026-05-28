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

// Hydration 機構 (design.md §9 Solid 流): SSR で焼き込まれた DOM tree を捨てずに、
// jsx 呼び出しを「DOM walk」 に変えて createElement を skip、 event handler と
// signal binding effect だけ attach する。
//
// module-level state (Solid 同様、 single-thread 前提):
//   - `isHydrating`: hydrate モード on/off
//   - `cursor`: 次に match すべき DOM child (jsx 呼ばれた時にここから引き継ぐ)
let isHydrating = false;
let cursor: ChildNode | null = null;

/**
 * SSR された root の children を引き継いで `cb` 内の jsx 呼び出しを hydrate する。
 * cb 内で jsx() が呼ばれると cursor から既存要素を取り出し、 effect (signal binding /
 * dynamic slot) は marker comment を anchor として既存 content に bind される。
 *
 * 想定: root は SSR で content が焼き込まれた element (例: `<hbn-island name="X">`)。
 * 非 Element child (Text / Comment / 空白) は skip、 mismatch (例: SSR `<div>` だが
 * jsx `<span>`) は createElement にフォールバックして整合性を保つ。
 */
export function hydrateInto(root: Element, cb: () => void): void {
  const prevHydrating = isHydrating;
  const prevCursor = cursor;
  isHydrating = true;
  cursor = root.firstChild;
  try {
    cb();
  } finally {
    isHydrating = prevHydrating;
    cursor = prevCursor;
  }
}

/**
 * JSX runtime (React automatic runtime spec)。
 * - `type`: 文字列なら DOM 要素、関数なら component / Fragment
 * - `props`: children は props.children 内
 * - `_key`: list rendering の key、 MVP では無視
 *
 * hydrate モード: cursor から既存 Element を採用、 children 処理中は cursor を
 * `el.firstChild` に切替、 終わったら採用 el の `nextSibling` に進める。 mismatch
 * なら createElement、 children は hydrate off で従来 path。
 */
export function jsx(type: string | Component, props: Props, _key?: unknown): Node {
  if (typeof type === "function") {
    return type(props ?? {});
  }

  let hydrated = false;
  if (isHydrating) {
    // text / comment / 空白 を skip して Element を採用
    while (cursor && cursor.nodeType !== 1) {
      cursor = cursor.nextSibling;
    }
    if (cursor instanceof Element && cursor.tagName.toLowerCase() === type.toLowerCase()) {
      hydrated = true;
    }
  }
  const el: Element = hydrated ? (cursor as Element) : document.createElement(type);

  // children 処理中の cursor / hydrate モード切替
  const outerCursor = cursor;
  const outerHydrating = isHydrating;
  if (hydrated) {
    cursor = el.firstChild;
  } else if (isHydrating) {
    isHydrating = false; // 新規 createElement の中身は hydrate しない
  }

  try {
    if (props) {
      for (const [key, value] of Object.entries(props)) {
        if (key === "children") continue;
        applyProp(el, key, value);
      }
      appendChild(el, props.children as Child);
    }
  } finally {
    isHydrating = outerHydrating;
    // 採用 el の次の sibling に cursor を進める。 非 hydrated なら outer cursor 復元
    cursor = hydrated ? el.nextSibling : outerCursor;
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
    // hydrate モード: child が既に正しい位置に居る場合 (jsx で採用された element)、
    // appendChild は no-op、 cursor は jsx 側で進めてある
    if (child.parentNode === parent) return;
    parent.appendChild(child);
    return;
  }

  // lazy children (compiler が `Object.assign(() => [...], { _hbnLazy: true })` で wrap):
  // intrinsic element の static children を遅延 eval するため。 hydrate モードで eval order
  // を DFS にする (内側 jsx は外側 jsx が cursor 切替後に呼ばれる)。 markers なし、 effect なし、
  // 1 回だけ eval して結果 array を appendChild で配置。
  if (
    typeof child === "function" &&
    (child as Function & { _hbnLazy?: boolean })._hbnLazy === true
  ) {
    const v = (child as () => Child[])();
    if (Array.isArray(v)) {
      for (const item of v) appendChild(parent, item);
    } else {
      appendChild(parent, v as Child);
    }
    return;
  }

  // signal binding: function child は effect 内で slot を更新。 dynamic slot は
  // **comment marker pair** で囲んで管理する (Solid 流 hydrate の土台)。
  //
  // - SSR で element の outerHTML を取ると marker comment は HTML に焼かれる
  //   (`<p>Hello, <!---->あさひ<!---->!</p>`)。 client が innerHTML parse すると
  //   comment node はそのまま保持される。 hydrate モードはこの marker を anchor として
  //   「動的 slot の position」 を identify、 既存 content (markers 間の textNode 等) を
  //   currentSingle / currentArrayNodes に bind して effect attach、 初回は同値 data 書き戻し
  //   で DOM churn なし。
  // - 既存挙動 (effect で reactive update) は完全保持: 単一 textNode は data 書き戻しで
  //   DOM churn 回避、 Node 切替は replaceChild、 array は marker 間に insertBefore で
  //   list rendering。
  //
  // 挙動: dynamic slot 1 個ごとに parent の childNodes が +2 (start marker + end marker)。
  if (typeof child === "function") {
    let startMark = document.createComment("");
    let endMark = document.createComment("");
    let currentSingle: Node | null = null;
    let currentArrayNodes: Node[] | null = null;

    let hydratedSlot = false;
    if (isHydrating) {
      // 空白 textNode は skip して comment marker を探す
      while (
        cursor &&
        cursor.nodeType === 3 /* TEXT_NODE */ &&
        (cursor as Text).data.trim() === ""
      ) {
        cursor = cursor.nextSibling;
      }
      if (cursor?.nodeType === 8 /* COMMENT_NODE */) {
        startMark = cursor as Comment;
        // start marker から end marker までを集める (between)
        const between: ChildNode[] = [];
        let n: ChildNode | null = startMark.nextSibling;
        while (n && n.nodeType !== 8) {
          between.push(n);
          n = n.nextSibling;
        }
        if (n) {
          endMark = n as Comment;
          if (between.length === 1) {
            currentSingle = between[0] ?? null;
          } else if (between.length > 1) {
            currentArrayNodes = between;
          }
          cursor = endMark.nextSibling;
          hydratedSlot = true;
        }
      }
    }
    if (!hydratedSlot) {
      parent.appendChild(startMark);
      parent.appendChild(endMark);
    }

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

  // static text / number 等
  // hydrate モード: 既存 textNode を採用、 cursor を進める。 値の一致は前提
  // (SSR と client で同じ string が出るはず、 不一致は user 責任)
  if (isHydrating && cursor?.nodeType === 3 /* TEXT_NODE */) {
    cursor = cursor.nextSibling;
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
