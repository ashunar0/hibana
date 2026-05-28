import type { MiddlewareHandler } from "hono";
import { ensureDom } from "hibana-compiler/ssr";

declare module "hono" {
  interface ContextRenderer {
    (content: Node | string): Response | Promise<Response>;
  }
}

export interface HibanaMiddlewareOptions {
  /** client bundle entry の URL */
  clientEntry?: string;
  /** islands manifest の URL */
  manifestPath?: string;
  /** <html lang="..."> */
  lang?: string;
  /** server bundle (`dist/.server/server.mjs`) の path — Phase 3 で renderIsland 経由 per-request SSR に使う */
  serverBundlePath?: string;
}

function renderHtml(
  inner: string,
  opts: Required<Pick<HibanaMiddlewareOptions, "clientEntry" | "manifestPath" | "lang">>,
): string {
  return (
    `<!doctype html>` +
    `<html lang="${opts.lang}">` +
    `<head>` +
    `<meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<link rel="modulepreload" href="${opts.clientEntry}">` +
    `<link rel="preload" href="${opts.manifestPath}" as="fetch" crossorigin>` +
    `<script type="module" src="${opts.clientEntry}"></script>` +
    `</head>` +
    `<body>${inner}</body>` +
    `</html>`
  );
}

export function hibana(options: HibanaMiddlewareOptions = {}): MiddlewareHandler {
  const resolved = {
    clientEntry: options.clientEntry ?? "/assets/main.js",
    manifestPath: options.manifestPath ?? "/islands.json",
    lang: options.lang ?? "en",
  };
  return async (c, next) => {
    await ensureDom();
    c.setRenderer((content) => {
      const inner =
        typeof content === "string"
          ? content
          : ((content as unknown as { outerHTML?: string }).outerHTML ?? "");
      return c.html(renderHtml(inner, resolved));
    });
    await next();
  };
}
