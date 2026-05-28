import { pathToFileURL } from "node:url";

const DOM_KEYS = [
  "window",
  "document",
  "HTMLElement",
  "Element",
  "Node",
  "Text",
  "DocumentFragment",
  "NodeFilter",
] as const;

const ISLAND_SYMBOL = Symbol.for("hibana.islands");

type IslandComponent = (props: Record<string, unknown>) => unknown;
type IslandRegistry = Record<string, IslandComponent>;

let domInstalled = false;

export async function ensureDom(): Promise<void> {
  if (domInstalled) return;
  const g = globalThis as Record<string, unknown>;
  if (g.document !== undefined) {
    domInstalled = true;
    return;
  }
  const { Window } = await import("happy-dom");
  const win = new Window();
  const dom = win as unknown as Record<string, unknown>;
  for (const k of DOM_KEYS) {
    g[k] = k === "window" ? win : k === "document" ? win.document : dom[k];
  }
  domInstalled = true;
}

function getRegistry(): IslandRegistry {
  const g = globalThis as Record<symbol, unknown>;
  const existing = g[ISLAND_SYMBOL];
  if (existing === undefined) {
    const r: IslandRegistry = {};
    g[ISLAND_SYMBOL] = r;
    return r;
  }
  return existing as IslandRegistry;
}

export function registerIsland(name: string, Component: IslandComponent): void {
  getRegistry()[name] = Component;
}

export interface LoadServerBundleOptions {
  /** 同一プロセス内で再 import が必要な場合 (build watch) に query を付けて ESM cache を回避 */
  cacheBust?: boolean;
}

export async function loadServerBundle(
  bundlePath: string,
  options: LoadServerBundleOptions = {},
): Promise<void> {
  await ensureDom();
  const href = pathToFileURL(bundlePath).href;
  const url = options.cacheBust ? `${href}?t=${Date.now()}` : href;
  await import(url);
}

export interface RenderIslandOptions {
  depth?: number;
  maxDepth?: number;
}

interface SsrPlaceholder {
  getAttribute(name: string): string | null;
  innerHTML: string;
}

interface SsrElement {
  querySelectorAll?: (selector: string) => Iterable<SsrPlaceholder>;
  outerHTML?: string;
}

export function renderIsland(
  name: string,
  props: Record<string, unknown> = {},
  options: RenderIslandOptions = {},
): string {
  const depth = options.depth ?? 0;
  const maxDepth = options.maxDepth ?? 10;
  if (depth > maxDepth) return "";
  const Component = getRegistry()[name];
  if (typeof Component !== "function") return "";

  let root: unknown;
  try {
    root = Component(props);
  } catch {
    return "";
  }
  const el = root as SsrElement;

  if (el.querySelectorAll) {
    for (const ph of Array.from(el.querySelectorAll("hbn-island[name]"))) {
      const childName = ph.getAttribute("name");
      if (!childName) continue;
      const propsStr = ph.getAttribute("data-props");
      const childProps = propsStr ? safeJsonParse(propsStr) : {};
      ph.innerHTML = renderIsland(childName, childProps, {
        depth: depth + 1,
        maxDepth,
      });
    }
  }
  return el.outerHTML ?? "";
}

function safeJsonParse(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * build process 等の短期 scope で SSR 環境を install → fn 実行 → 元に戻す helper。
 *
 * - happy-dom global を pre-existing でなければ install (= 既に test や別 process が立てていれば触らない)
 * - island registry を一旦空に初期化、 後で元の値に戻す
 *
 * long-lived な server (hibana middleware) では `ensureDom()` で永続 install する想定で、
 * こちらは vite plugin の closeBundle 等から呼ぶ。
 */
export async function withSsrContext<T>(fn: () => T | Promise<T>): Promise<T> {
  const g = globalThis as Record<string | symbol, unknown>;
  const hadDom = g.document !== undefined;
  const prevDom: Record<string, unknown> = {};

  if (!hadDom) {
    const { Window } = await import("happy-dom");
    const win = new Window();
    const dom = win as unknown as Record<string, unknown>;
    for (const k of DOM_KEYS) {
      prevDom[k] = g[k];
      g[k] = k === "window" ? win : k === "document" ? win.document : dom[k];
    }
    domInstalled = true;
  }

  const symG = g as Record<symbol, unknown>;
  const prevRegistry = symG[ISLAND_SYMBOL];
  symG[ISLAND_SYMBOL] = {};

  try {
    return await fn();
  } finally {
    if (!hadDom) {
      for (const k of DOM_KEYS) {
        if (prevDom[k] === undefined) delete g[k];
        else g[k] = prevDom[k];
      }
      domInstalled = false;
    }
    if (prevRegistry === undefined) delete symG[ISLAND_SYMBOL];
    else symG[ISLAND_SYMBOL] = prevRegistry;
  }
}
