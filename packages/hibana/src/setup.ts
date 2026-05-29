import type { Handler, Hono, MiddlewareHandler } from "hono";
import {
  ensureDom,
  getErrorPage,
  getMiddlewares,
  getNotFound,
  getRoutes,
  loadServerBundle,
} from "hibana-compiler/ssr";
import { hibana, type HibanaMiddlewareOptions } from "./server.ts";

type AnyHandler = MiddlewareHandler | Handler;

/**
 * Hono app に hibana 一式を install する 1 行 helper。
 *
 * 役割:
 * 1. happy-dom + server bundle (= `dist/.server/server.mjs`) を起動時に load
 *    → islands / routes / middlewares / notFound / errorPage が registry に登録される
 * 2. `c.render` middleware を install (= 既存 `hibana()` を内部 reuse)
 * 3. registry の middleware を `app.use(mountPath, ...handlers)` で配線 (= _middleware.{ts,tsx})
 * 4. registry の routes を `app.on(method, path, ...handlers)` で自動配線
 * 5. registry の notFound / errorPage が登録されてれば `app.notFound` / `app.onError` で配線
 *    (= _404.{ts,tsx} / _error.{ts,tsx}、 status code は 404 / 500 を立てる)
 *
 * `app/routes/*.ts(x)` の `export default` = GET (省略時)、 `export const POST` 等 =
 * 各 method として展開される (= ssr/index.ts の `getRoutes()` ロジック)。
 *
 * 呼び出し後に user が `app.get("/api/health", ...)` 等を追加で書くのも OK。
 */
export async function setupHibana(app: Hono, options: HibanaMiddlewareOptions = {}): Promise<void> {
  await ensureDom();
  if (options.serverBundlePath) {
    await loadServerBundle(options.serverBundlePath);
  }

  app.use("*", hibana(options));

  // _middleware.{ts,tsx} (= file-based directory middleware)、 outer → inner の順で register
  for (const { mountPath, handlers } of getMiddlewares()) {
    app.use(mountPath, ...(handlers as MiddlewareHandler[]));
  }

  for (const { path, methods } of getRoutes()) {
    for (const [method, handlers] of Object.entries(methods)) {
      // app.on の overload 解決を array 形式で強制 ([methods[], paths[], ...handlers])
      app.on([method], [path], ...(handlers as AnyHandler[]));
    }
  }

  // _404.{ts,tsx} (= custom not-found page)
  const NotFound = getNotFound();
  if (NotFound) {
    app.notFound((c) => {
      c.status(404);
      return c.render(NotFound() as Parameters<typeof c.render>[0]);
    });
  }

  // _error.{ts,tsx} (= custom error page、 props.error に投げ込まれた値が来る)
  const ErrorPage = getErrorPage();
  if (ErrorPage) {
    app.onError((err, c) => {
      c.status(500);
      return c.render(ErrorPage({ error: err }) as Parameters<typeof c.render>[0]);
    });
  }
}
