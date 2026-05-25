import { type Subject, notifySubscribers, track } from "./tracking.ts";

// Store<T> は object/array の deep reactive primitive (Solid createStore / Vue reactive 相当)。
// 設計判断:
// - per-key lazy Subject: 各 (raw, key) ペアに `{ subscribers }` を WeakMap で割り当てる
// - plain object と array のみ wrap、 Date / Map / Set 等は素通し (Solid 流)
// - Proxy 自体も WeakMap でキャッシュ → `store.user === store.user` の referential stability
// - `Object.is` で同値 skip (Signal と同じ semantics)
// - peek なし (設計書 §4.5、 直接 access が syntax なので対称性不要)
//
// 型: constructor の戻り値型を T 自身にして、 利用者から見ると元 object そのものに見せる。
// `store.user.name` は通常の property access と同じ TS 推論で書ける。

const STORE_RAW = Symbol("hibana.store.raw");

const wrappedCache = new WeakMap<object, object>();
const nodeCache = new WeakMap<object, Map<PropertyKey, Subject>>();

function isWrappable(value: unknown): value is object {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return true;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function getNode(raw: object, key: PropertyKey): Subject {
  let map = nodeCache.get(raw);
  if (!map) {
    map = new Map();
    nodeCache.set(raw, map);
  }
  let node = map.get(key);
  if (!node) {
    node = { subscribers: new Set() };
    map.set(key, node);
  }
  return node;
}

function unwrap<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    const raw = (value as { [STORE_RAW]?: object })[STORE_RAW];
    if (raw) return raw as T;
  }
  return value;
}

function wrap<T extends object>(raw: T): T {
  const cached = wrappedCache.get(raw);
  if (cached) return cached as T;

  const proxy = new Proxy(raw, {
    get(target, key, receiver) {
      if (key === STORE_RAW) return target;
      const value = Reflect.get(target, key, receiver);
      // function (Array.prototype.push 等) は track しない、 receiver 経由で呼ばれる side-effect
      // のみ Proxy.set が拾えば良いので素通し
      if (typeof value === "function") return value;
      track(getNode(target, key));
      return isWrappable(value) ? wrap(value) : value;
    },

    set(target, key, newValue, receiver) {
      const isArr = Array.isArray(target);
      const prevLen = isArr ? (target as unknown[]).length : undefined;
      const prev = Reflect.get(target, key, receiver);
      const next = unwrap(newValue);
      if (Object.is(prev, next)) return true;
      const ok = Reflect.set(target, key, next, receiver);
      if (ok) {
        notifySubscribers(getNode(target, key));
        // array の index 書き込みは length を暗黙更新するので、 length も notify
        // (push 末尾の this.length = newLen は同値スキップで no-op になるため補完が必要)
        if (isArr && key !== "length" && (target as unknown[]).length !== prevLen) {
          notifySubscribers(getNode(target, "length"));
        }
      }
      return ok;
    },

    deleteProperty(target, key) {
      const had = Object.hasOwn(target, key);
      const ok = Reflect.deleteProperty(target, key);
      if (ok && had) notifySubscribers(getNode(target, key));
      return ok;
    },
  });

  wrappedCache.set(raw, proxy);
  return proxy as T;
}

// Store<T> as constructor: 戻り値型を T 自身にして利用側で `store.foo` の型が通るようにする。
interface StoreConstructor {
  new <T extends object>(initial: T): T;
}

function createStore<T extends object>(initial: T): T {
  return wrap(initial);
}

export const Store: StoreConstructor = createStore as unknown as StoreConstructor;
