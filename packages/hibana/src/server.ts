import type { MiddlewareHandler } from "hono";
import { ensureDom, getLayout, loadServerBundle, renderIsland } from "hibana-compiler/ssr";

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
  /** server bundle (`dist/.server/server.mjs`) の path — 渡すと middleware 構築時に 1 度 import して island registry を準備する */
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

function safeJsonParse(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
}

interface SsrElement {
  tagName?: string;
  outerHTML?: string;
  innerHTML?: string;
  getAttribute?: (name: string) => string | null;
  querySelectorAll?: (selector: string) => Iterable<unknown>;
}

function fillIslands(content: Node | string): string {
  if (typeof content === "string") return content;
  const el = content as unknown as SsrElement;

  const tag = typeof el.tagName === "string" ? el.tagName.toLowerCase() : "";
  if (tag === "hbn-island") {
    const name = el.getAttribute?.("name") ?? null;
    if (name) {
      const propsStr = el.getAttribute?.("data-props") ?? null;
      const props = propsStr ? safeJsonParse(propsStr) : {};
      el.innerHTML = renderIsland(name, props);
    }
    return el.outerHTML ?? "";
  }

  if (el.querySelectorAll) {
    for (const ph of Array.from(el.querySelectorAll("hbn-island[name]"))) {
      const ce = ph as SsrElement;
      const childName = ce.getAttribute?.("name") ?? null;
      if (!childName) continue;
      const propsStr = ce.getAttribute?.("data-props") ?? null;
      const childProps = propsStr ? safeJsonParse(propsStr) : {};
      ce.innerHTML = renderIsland(childName, childProps);
    }
  }
  return el.outerHTML ?? "";
}

export function hibana(options: HibanaMiddlewareOptions = {}): MiddlewareHandler {
  const resolved = {
    clientEntry: options.clientEntry ?? "/assets/main.js",
    manifestPath: options.manifestPath ?? "/islands.json",
    lang: options.lang ?? "en",
  };

  const initPromise = (async () => {
    await ensureDom();
    if (options.serverBundlePath) {
      await loadServerBundle(options.serverBundlePath);
    }
  })();

  return async (c, next) => {
    await initPromise;
    c.setRenderer((content) => {
      // layout が登録されてれば content を children として wrap (= `<header/>{content}<footer/>`)。
      // 未登録なら content をそのまま body 内側として template wrap。
      const layout = getLayout();
      const wrapped = layout !== null ? (layout({ children: content }) as Node | string) : content;
      const inner = fillIslands(wrapped);
      return c.html(renderHtml(inner, resolved));
    });
    await next();
  };
}
