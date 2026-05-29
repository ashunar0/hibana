import fs from "node:fs/promises";
import path from "node:path";

export interface RouteFileInfo {
  /** project root からの相対 path (例: "app/routes/blog/[slug].ts") */
  source: string;
  /** Hono path pattern (例: "/blog/:slug") */
  pattern: string;
}

export interface LayoutFileInfo {
  /** project root からの相対 path (例: "app/routes/_layout.tsx") */
  source: string;
}

/**
 * `<rootDir>/app/routes/_layout.{ts,tsx}` を探す (root layout のみ)。
 *
 * nested layout (`/blog/_layout.tsx` 等) は YAGNI で T31.1+ に温存。
 * 該当 file が無ければ `null`。
 */
export async function findRootLayout(rootDir: string): Promise<LayoutFileInfo | null> {
  for (const ext of ["tsx", "ts"]) {
    const abs = path.join(rootDir, "app", "routes", `_layout.${ext}`);
    try {
      const st = await fs.stat(abs);
      if (st.isFile()) {
        return { source: path.relative(rootDir, abs) };
      }
    } catch {
      // not found
    }
  }
  return null;
}

/**
 * `<rootDir>/app/routes/` 配下を再帰 walk し、 各 `.ts` / `.tsx` を route として収集。
 *
 * 除外:
 * - underscored ファイル (`_renderer.tsx` / `_middleware.ts` / `_404.tsx` 等) は T31.1+ で扱う、 ここでは skip
 * - `node_modules` / dotfile / dotdir
 *
 * 並び順: source path のアルファベット順 (安定性のため。 file pattern conflict は別途警告)。
 */
export async function walkRoutes(rootDir: string): Promise<RouteFileInfo[]> {
  const routesDir = path.join(rootDir, "app", "routes");
  let isDir = false;
  try {
    const st = await fs.stat(routesDir);
    isDir = st.isDirectory();
  } catch {
    isDir = false;
  }
  if (!isDir) return [];

  const files: string[] = [];
  await walkDir(routesDir, files);

  const infos: RouteFileInfo[] = [];
  for (const abs of files) {
    const rel = path.relative(routesDir, abs);
    const pattern = filePathToPattern(rel);
    if (pattern === null) continue;
    infos.push({
      source: path.relative(rootDir, abs),
      pattern,
    });
  }
  infos.sort((a, b) => a.source.localeCompare(b.source));
  return infos;
}

async function walkDir(dir: string, out: string[]): Promise<void> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (ent.name.startsWith(".") || ent.name === "node_modules") continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      await walkDir(full, out);
    } else if (ent.isFile() && (ent.name.endsWith(".ts") || ent.name.endsWith(".tsx"))) {
      if (ent.name.startsWith("_")) continue;
      out.push(full);
    }
  }
}

/**
 * routes dir からの相対 file path を Hono path pattern に変換。
 *
 * - `index.ts` → `/`
 * - `about.ts` → `/about`
 * - `blog/[slug].ts` → `/blog/:slug`
 * - `shop/[...category].ts` → `/shop/:category+`
 * - `foo/index.ts` → `/foo`
 *
 * 不正な segment (空 / 特殊文字) を含む場合は `null`。
 */
export function filePathToPattern(filePath: string): string | null {
  const withoutExt = filePath.replace(/\.tsx?$/, "");
  const segments = withoutExt.split(path.sep);
  const out: string[] = [];
  for (const seg of segments) {
    if (seg === "index") continue;
    const t = transformSegment(seg);
    if (t === null) return null;
    out.push(t);
  }
  return out.length === 0 ? "/" : "/" + out.join("/");
}

function transformSegment(seg: string): string | null {
  const restMatch = /^\[\.\.\.([A-Za-z_][A-Za-z0-9_]*)\]$/.exec(seg);
  if (restMatch) return `:${restMatch[1]}+`;
  const dynMatch = /^\[([A-Za-z_][A-Za-z0-9_]*)\]$/.exec(seg);
  if (dynMatch) return `:${dynMatch[1]}`;
  if (/^[A-Za-z0-9_-]+$/.test(seg)) return seg;
  return null;
}
