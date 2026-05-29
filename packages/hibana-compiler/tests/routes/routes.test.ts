import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vite-plus/test";
import {
  filePathToPattern,
  findErrorPage,
  findNotFound,
  findRootLayout,
  walkMiddlewares,
  walkRoutes,
} from "../../src/routes/index.ts";

test("filePathToPattern: index.ts → /", () => {
  expect(filePathToPattern("index.ts")).toBe("/");
});

test("filePathToPattern: about.ts → /about", () => {
  expect(filePathToPattern("about.ts")).toBe("/about");
});

test("filePathToPattern: foo/index.ts → /foo", () => {
  expect(filePathToPattern(path.join("foo", "index.ts"))).toBe("/foo");
});

test("filePathToPattern: dynamic [slug] → :slug", () => {
  expect(filePathToPattern(path.join("blog", "[slug].ts"))).toBe("/blog/:slug");
});

test("filePathToPattern: nested dynamic blog/[slug]/edit.ts", () => {
  expect(filePathToPattern(path.join("blog", "[slug]", "edit.ts"))).toBe("/blog/:slug/edit");
});

test("filePathToPattern: catch-all [...rest] → :rest+", () => {
  expect(filePathToPattern(path.join("shop", "[...category].ts"))).toBe("/shop/:category+");
});

test("filePathToPattern: .tsx も受ける", () => {
  expect(filePathToPattern("about.tsx")).toBe("/about");
});

test("filePathToPattern: 不正な特殊文字を含む segment は null", () => {
  expect(filePathToPattern("foo bar.ts")).toBeNull();
  expect(filePathToPattern("foo$.ts")).toBeNull();
});

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hibana-routes-test-"));
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

async function makeRoute(rel: string, content = ""): Promise<void> {
  const abs = path.join(tmpRoot, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content);
}

test("walkRoutes: app/routes/ がなければ空配列", async () => {
  expect(await walkRoutes(tmpRoot)).toEqual([]);
});

test("walkRoutes: index / 静的 / 動的 / catch-all を全部拾う", async () => {
  await makeRoute("app/routes/index.ts");
  await makeRoute("app/routes/about.tsx");
  await makeRoute("app/routes/blog/[slug].ts");
  await makeRoute("app/routes/shop/[...category].ts");

  const out = await walkRoutes(tmpRoot);
  expect(out.map((r) => r.pattern).sort()).toEqual(
    ["/", "/about", "/blog/:slug", "/shop/:category+"].sort(),
  );
  // source は project root からの相対 path
  expect(out.every((r) => r.source.startsWith("app/routes/"))).toBe(true);
});

test("walkRoutes: underscored ファイル (_renderer.tsx 等) は skip", async () => {
  await makeRoute("app/routes/index.ts");
  await makeRoute("app/routes/_renderer.tsx");
  await makeRoute("app/routes/_middleware.ts");
  await makeRoute("app/routes/foo/_layout.tsx");

  const out = await walkRoutes(tmpRoot);
  expect(out.map((r) => r.pattern)).toEqual(["/"]);
});

test("walkRoutes: node_modules / dotdir は skip", async () => {
  await makeRoute("app/routes/index.ts");
  await makeRoute("app/routes/node_modules/foo.ts");
  await makeRoute("app/routes/.cache/bar.ts");

  const out = await walkRoutes(tmpRoot);
  expect(out.map((r) => r.pattern)).toEqual(["/"]);
});

test("walkRoutes: .ts / .tsx 以外は無視", async () => {
  await makeRoute("app/routes/index.ts");
  await makeRoute("app/routes/README.md");
  await makeRoute("app/routes/style.css");

  const out = await walkRoutes(tmpRoot);
  expect(out.map((r) => r.pattern)).toEqual(["/"]);
});

test("findRootLayout: app/routes/_layout.tsx が無ければ null", async () => {
  expect(await findRootLayout(tmpRoot)).toBeNull();
});

test("findRootLayout: _layout.tsx を見つけたら source を返す", async () => {
  await makeRoute("app/routes/_layout.tsx");
  const info = await findRootLayout(tmpRoot);
  expect(info).not.toBeNull();
  expect(info?.source).toBe(path.join("app", "routes", "_layout.tsx"));
});

test("findRootLayout: _layout.ts (no x) も拾う", async () => {
  await makeRoute("app/routes/_layout.ts");
  const info = await findRootLayout(tmpRoot);
  expect(info?.source).toBe(path.join("app", "routes", "_layout.ts"));
});

test("findRootLayout: .tsx と .ts が両方あれば .tsx 優先", async () => {
  await makeRoute("app/routes/_layout.tsx");
  await makeRoute("app/routes/_layout.ts");
  const info = await findRootLayout(tmpRoot);
  expect(info?.source).toBe(path.join("app", "routes", "_layout.tsx"));
});

test("walkMiddlewares: app/routes/ がなければ空配列", async () => {
  expect(await walkMiddlewares(tmpRoot)).toEqual([]);
});

test("walkMiddlewares: root _middleware は mountPath /*", async () => {
  await makeRoute("app/routes/_middleware.ts");
  const out = await walkMiddlewares(tmpRoot);
  expect(out).toHaveLength(1);
  expect(out[0]?.mountPath).toBe("/*");
});

test("walkMiddlewares: nested _middleware は directory path + /*", async () => {
  await makeRoute("app/routes/_middleware.ts");
  await makeRoute("app/routes/admin/_middleware.ts");
  await makeRoute("app/routes/admin/users/_middleware.ts");
  const out = await walkMiddlewares(tmpRoot);
  expect(out.map((m) => m.mountPath)).toEqual(["/*", "/admin/*", "/admin/users/*"]);
});

test("walkMiddlewares: depth ascending → 同 depth alphabetical で安定", async () => {
  await makeRoute("app/routes/zeta/_middleware.ts");
  await makeRoute("app/routes/alpha/_middleware.ts");
  await makeRoute("app/routes/alpha/beta/_middleware.ts");
  const out = await walkMiddlewares(tmpRoot);
  expect(out.map((m) => m.mountPath)).toEqual(["/alpha/*", "/zeta/*", "/alpha/beta/*"]);
});

test("walkMiddlewares: .tsx と .ts が両方あれば .tsx 優先", async () => {
  await makeRoute("app/routes/_middleware.tsx");
  await makeRoute("app/routes/_middleware.ts");
  const out = await walkMiddlewares(tmpRoot);
  expect(out).toHaveLength(1);
  expect(out[0]?.source).toContain("_middleware.tsx");
});

test("findNotFound: _404.{ts,tsx} を見つける、 無ければ null", async () => {
  expect(await findNotFound(tmpRoot)).toBeNull();
  await makeRoute("app/routes/_404.tsx");
  const info = await findNotFound(tmpRoot);
  expect(info?.source).toBe(path.join("app", "routes", "_404.tsx"));
});

test("findErrorPage: _error.{ts,tsx} を見つける、 無ければ null", async () => {
  expect(await findErrorPage(tmpRoot)).toBeNull();
  await makeRoute("app/routes/_error.tsx");
  const info = await findErrorPage(tmpRoot);
  expect(info?.source).toBe(path.join("app", "routes", "_error.tsx"));
});
