import type { MiddlewareHandler } from "hono";

// Root scope middleware: 全 request に X-Powered-By + 簡易 log。
// 配置 file = app/routes/_middleware.ts → mountPath = /*。
const middleware: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  await next();
  c.res.headers.set("X-Powered-By", "hibana");
  console.log(`[mw] ${c.req.method} ${c.req.url} ${c.res.status} (${Date.now() - start}ms)`);
};

export default middleware;
