import type { Handler, Hono, MiddlewareHandler } from "hono";
import { ensureDom, getRoutes, loadServerBundle } from "hibana-compiler/ssr";
import { hibana, type HibanaMiddlewareOptions } from "./server.ts";

type AnyHandler = MiddlewareHandler | Handler;

/**
 * Hono app に hibana 一式を install する 1 行 helper。
 *
 * 役割:
 * 1. happy-dom + server bundle (= `dist/.server/server.mjs`) を起動時に load
 *    → islands / routes が registry に登録される
 * 2. `c.render` middleware を install (= 既存 `hibana()` を内部 reuse)
 * 3. registry の routes を `app.on(method, path, ...handlers)` で自動配線
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

  for (const { path, methods } of getRoutes()) {
    for (const [method, handlers] of Object.entries(methods)) {
      // app.on の overload 解決を array 形式で強制 ([methods[], paths[], ...handlers])
      app.on([method], [path], ...(handlers as AnyHandler[]));
    }
  }
}
