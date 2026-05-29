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
const ROUTE_SYMBOL = Symbol.for("hibana.routes");
const LAYOUT_SYMBOL = Symbol.for("hibana.layout");
const MIDDLEWARE_SYMBOL = Symbol.for("hibana.middlewares");
const NOT_FOUND_SYMBOL = Symbol.for("hibana.notFound");
const ERROR_PAGE_SYMBOL = Symbol.for("hibana.errorPage");

type IslandComponent = (props: Record<string, unknown>) => unknown;
type IslandRegistry = Record<string, IslandComponent>;

/** layout module の shape (= `export default RootLayout`) */
export interface LayoutModule {
  default?: unknown;
}

/** layout component の型 (= props.children を受け取って Node を返す) */
export type LayoutComponent = (props: { children: unknown }) => unknown;

export type RouteMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD";

/** Hono Handler の配列 (hibana-compiler は中身を見ない、 hibana 側が信じて配線する) */
export type RouteHandlers = unknown[];

/** routes module の shape: `export default` = GET (省略時)、 named export = method */
export interface RouteModule {
  default?: unknown;
  GET?: unknown;
  POST?: unknown;
  PUT?: unknown;
  PATCH?: unknown;
  DELETE?: unknown;
  OPTIONS?: unknown;
  HEAD?: unknown;
}

export interface RegisteredRoute {
  /** Hono path pattern (例: "/blog/:slug") */
  path: string;
  methods: Partial<Record<RouteMethod, RouteHandlers>>;
}

const ROUTE_METHODS: RouteMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"];

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

interface RawRouteEntry {
  path: string;
  module: RouteModule;
}

function getRouteRegistry(): RawRouteEntry[] {
  const g = globalThis as Record<symbol, unknown>;
  const existing = g[ROUTE_SYMBOL];
  if (existing === undefined) {
    const r: RawRouteEntry[] = [];
    g[ROUTE_SYMBOL] = r;
    return r;
  }
  return existing as RawRouteEntry[];
}

function toArray(v: unknown): RouteHandlers {
  return Array.isArray(v) ? (v as RouteHandlers) : [v];
}

/**
 * routes module を path に紐付けて registry に登録する。
 *
 * 内部表現は `{ path, module }` の生のまま。 method 展開は `getRoutes` 時に行う
 * (= server bundle が hibana-compiler を external dep に持たず globalThis 直叩きで
 * push できる形式に揃えるため)。
 */
export function registerRoute(path: string, routeModule: RouteModule): void {
  getRouteRegistry().push({ path, module: routeModule });
}

function expandMethods(module: RouteModule): Partial<Record<RouteMethod, RouteHandlers>> {
  const methods: Partial<Record<RouteMethod, RouteHandlers>> = {};
  for (const m of ROUTE_METHODS) {
    const val = module[m];
    if (val !== undefined) methods[m] = toArray(val);
  }
  // default = GET (省略時のみ。 named GET があればそちらが優先)
  if (module.default !== undefined && methods.GET === undefined) {
    methods.GET = toArray(module.default);
  }
  return methods;
}

/**
 * registry の各 entry を `{ path, methods }` に展開して返す。
 * handler を何も持たない module は出力に含めない。
 */
export function getRoutes(): RegisteredRoute[] {
  const out: RegisteredRoute[] = [];
  for (const { path, module } of getRouteRegistry()) {
    const methods = expandMethods(module);
    if (Object.keys(methods).length > 0) {
      out.push({ path, methods });
    }
  }
  return out;
}

/** routes registry を空にする (= test や short-scope build process で使う)。 */
export function clearRoutes(): void {
  const reg = getRouteRegistry();
  reg.length = 0;
}

/**
 * root layout module を登録する (= `app/routes/_layout.{ts,tsx}`)。
 *
 * 既に登録されていれば上書き。 nested layout は YAGNI で未サポート。
 */
export function registerLayout(module: LayoutModule): void {
  const g = globalThis as Record<symbol, unknown>;
  g[LAYOUT_SYMBOL] = module;
}

/**
 * 登録された layout component (= module.default) を返す。 未登録なら null。
 */
export function getLayout(): LayoutComponent | null {
  const g = globalThis as Record<symbol, unknown>;
  const module = g[LAYOUT_SYMBOL] as LayoutModule | undefined;
  if (!module) return null;
  const comp = module.default;
  return typeof comp === "function" ? (comp as LayoutComponent) : null;
}

/** layout registry を unset する (= test 等で使う)。 */
export function clearLayout(): void {
  const g = globalThis as Record<symbol, unknown>;
  delete g[LAYOUT_SYMBOL];
}

/**
 * middleware module の shape (= `export default MiddlewareHandler`)。
 * `default` は MiddlewareHandler 1 つ、 もしくは配列。 配列は順番通り適用される。
 */
export interface MiddlewareModule {
  default?: unknown;
}

export interface RegisteredMiddleware {
  /** Hono `app.use` 用の pattern (= "/*", "/admin/*" 等) */
  mountPath: string;
  /** MiddlewareHandler 1 つ or 配列 (= toArray で正規化された配列) */
  handlers: unknown[];
}

interface RawMiddlewareEntry {
  mountPath: string;
  module: MiddlewareModule;
}

function getMiddlewareRegistry(): RawMiddlewareEntry[] {
  const g = globalThis as Record<symbol, unknown>;
  const existing = g[MIDDLEWARE_SYMBOL];
  if (existing === undefined) {
    const r: RawMiddlewareEntry[] = [];
    g[MIDDLEWARE_SYMBOL] = r;
    return r;
  }
  return existing as RawMiddlewareEntry[];
}

/** middleware module を mountPath に紐付けて registry に push。 順序は register 順を保持。 */
export function registerMiddleware(mountPath: string, module: MiddlewareModule): void {
  getMiddlewareRegistry().push({ mountPath, module });
}

/** 登録された middleware を `{ mountPath, handlers[] }` 配列で返す。 default の無い module は skip。 */
export function getMiddlewares(): RegisteredMiddleware[] {
  const out: RegisteredMiddleware[] = [];
  for (const { mountPath, module } of getMiddlewareRegistry()) {
    if (module.default === undefined) continue;
    out.push({ mountPath, handlers: toArray(module.default) });
  }
  return out;
}

export function clearMiddlewares(): void {
  const reg = getMiddlewareRegistry();
  reg.length = 0;
}

/**
 * not-found / error page の module shape (= `export default Component`)。
 * NotFound は引数なし、 ErrorPage は `{ error: Error }` を受ける。
 */
export interface SpecialPageModule {
  default?: unknown;
}

export type NotFoundComponent = () => unknown;
export type ErrorPageComponent = (props: { error: Error }) => unknown;

/** not-found component module を登録 (= 1 つだけ、 上書き)。 */
export function registerNotFound(module: SpecialPageModule): void {
  const g = globalThis as Record<symbol, unknown>;
  g[NOT_FOUND_SYMBOL] = module;
}

export function getNotFound(): NotFoundComponent | null {
  const g = globalThis as Record<symbol, unknown>;
  const module = g[NOT_FOUND_SYMBOL] as SpecialPageModule | undefined;
  if (!module) return null;
  const comp = module.default;
  return typeof comp === "function" ? (comp as NotFoundComponent) : null;
}

export function clearNotFound(): void {
  const g = globalThis as Record<symbol, unknown>;
  delete g[NOT_FOUND_SYMBOL];
}

/** error page component module を登録 (= 1 つだけ、 上書き)。 */
export function registerErrorPage(module: SpecialPageModule): void {
  const g = globalThis as Record<symbol, unknown>;
  g[ERROR_PAGE_SYMBOL] = module;
}

export function getErrorPage(): ErrorPageComponent | null {
  const g = globalThis as Record<symbol, unknown>;
  const module = g[ERROR_PAGE_SYMBOL] as SpecialPageModule | undefined;
  if (!module) return null;
  const comp = module.default;
  return typeof comp === "function" ? (comp as ErrorPageComponent) : null;
}

export function clearErrorPage(): void {
  const g = globalThis as Record<symbol, unknown>;
  delete g[ERROR_PAGE_SYMBOL];
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
  const prevIslands = symG[ISLAND_SYMBOL];
  const prevRoutes = symG[ROUTE_SYMBOL];
  const prevLayout = symG[LAYOUT_SYMBOL];
  const prevMiddlewares = symG[MIDDLEWARE_SYMBOL];
  const prevNotFound = symG[NOT_FOUND_SYMBOL];
  const prevErrorPage = symG[ERROR_PAGE_SYMBOL];
  symG[ISLAND_SYMBOL] = {};
  symG[ROUTE_SYMBOL] = [];
  delete symG[LAYOUT_SYMBOL];
  symG[MIDDLEWARE_SYMBOL] = [];
  delete symG[NOT_FOUND_SYMBOL];
  delete symG[ERROR_PAGE_SYMBOL];

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
    if (prevIslands === undefined) delete symG[ISLAND_SYMBOL];
    else symG[ISLAND_SYMBOL] = prevIslands;
    if (prevRoutes === undefined) delete symG[ROUTE_SYMBOL];
    else symG[ROUTE_SYMBOL] = prevRoutes;
    if (prevLayout === undefined) delete symG[LAYOUT_SYMBOL];
    else symG[LAYOUT_SYMBOL] = prevLayout;
    if (prevMiddlewares === undefined) delete symG[MIDDLEWARE_SYMBOL];
    else symG[MIDDLEWARE_SYMBOL] = prevMiddlewares;
    if (prevNotFound === undefined) delete symG[NOT_FOUND_SYMBOL];
    else symG[NOT_FOUND_SYMBOL] = prevNotFound;
    if (prevErrorPage === undefined) delete symG[ERROR_PAGE_SYMBOL];
    else symG[ERROR_PAGE_SYMBOL] = prevErrorPage;
  }
}
