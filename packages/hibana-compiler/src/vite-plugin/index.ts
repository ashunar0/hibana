import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build as viteBuild, type Plugin, type ResolvedConfig } from "vite";
import { compile } from "../compiler/compile.ts";
import { extractIslands } from "../extractor/extract-islands.ts";

/** ファイルが Pattern 3 syntax を含むかの短絡判定。 含まないなら transform skip。 */
export function shouldTransform(id: string, code: string): boolean {
  if (!id.endsWith(".tsx")) return false;
  // node_modules 配下や `?...` query 付きは skip
  if (id.includes("node_modules")) return false;
  return /(?<![.\w])component\s+[A-Z]\w*\s*\(/.test(code);
}

/**
 * Islands manifest の 1 エントリ。 build 時に `dist/islands.json` として出力される。
 * - `source`: project root (vite config.root) からの相対 path
 * - `chunk`: build 時に per-island chunk として emit された asset の最終 path。 dev では undefined
 * - `interactive`: false なら client JS shipping なし (static island、 SSR HTML のみ)
 * - `reasons`: interactive 判定の根拠 (debug 用、 analyzer の reasons をそのまま transfer)
 */
export interface ManifestEntry {
  source: string;
  line: number;
  props: string[];
  chunk?: string;
  interactive: boolean;
  reasons: string[];
}

export type IslandManifest = Record<string, ManifestEntry>;

export interface HibanaPluginOptions {
  /** manifest emit 時のファイル名 (default: "islands.json")。 */
  manifestFileName?: string;
}

const VIRTUAL_PREFIX = "virtual:hibana-island/";
const RESOLVED_PREFIX = `\0${VIRTUAL_PREFIX}`;
const SERVER_ENTRY_ID = "virtual:hibana-server-entry";
const RESOLVED_SERVER_ENTRY = `\0${SERVER_ENTRY_ID}`;
const SERVER_OUT_SUBDIR = ".server";
const SERVER_BUNDLE_NAME = "server.mjs";

async function walkTsx(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    if (ent.name === "node_modules" || ent.name === "dist" || ent.name.startsWith(".")) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...(await walkTsx(full)));
    } else if (ent.isFile() && ent.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

export function hibana(options: HibanaPluginOptions = {}): Plugin {
  const manifest: IslandManifest = {};
  const islandAbsPath: Record<string, string> = {};
  const chunkRefs = new Map<string, string>();
  const manifestFileName = options.manifestFileName ?? "islands.json";
  let resolvedRoot = process.cwd();
  let outDir = "dist";
  let isBuild = false;
  // server bundle build (子 vite.build({ ssr: true }) で起動された 2 回目の pass) か。
  // closeBundle の SSR 焼き込み起動を skip して再帰を止める。 また client build 専用の
  // 動作 (per-island chunk emit / manifest 出力) も skip する。
  let isSsrBuild = false;

  return {
    name: "hibana",
    enforce: "pre",
    configResolved(config: ResolvedConfig) {
      resolvedRoot = config.root;
      outDir = path.resolve(config.root, config.build.outDir);
      isBuild = config.command === "build";
      isSsrBuild = isBuild && Boolean(config.build.ssr);
    },
    async buildStart() {
      // dev / build 両方で project root を fs scan し、 全 island を manifest に populate する。
      // build 時は同時に per-island chunk も emit (dev は chunk emit 不要、 source から
      // virtual module 経由で on-the-fly serve される)。 entry に到達してない component が
      // manifest に出ない問題 (transform 側の populate に頼ると起きる) もここで解決。
      const files = await walkTsx(resolvedRoot);
      for (const absFile of files) {
        let code: string;
        try {
          code = await fs.readFile(absFile, "utf8");
        } catch {
          continue;
        }
        if (!shouldTransform(absFile, code)) continue;

        let islands: ReturnType<typeof extractIslands>;
        try {
          islands = extractIslands(code);
        } catch {
          continue;
        }
        const relSource = path.relative(resolvedRoot, absFile);
        for (const island of islands) {
          const prev = manifest[island.name];
          if (prev && prev.source !== relSource) {
            this.warn(
              `[hibana] duplicate island name "${island.name}" (previous: ${prev.source}, now: ${relSource}); overwriting`,
            );
          }
          manifest[island.name] = {
            source: relSource,
            line: island.line,
            props: island.props,
            interactive: island.interactive,
            reasons: island.reasons,
          };
          islandAbsPath[island.name] = absFile;

          // chunk emit は client build かつ interactive island のみ:
          // - server build (ssr: true) は virtual:hibana-server-entry が単一 bundle 化、 個別 chunk 不要
          // - static island は client JS shipping なし、 SSR HTML のみで完結
          if (isBuild && !isSsrBuild && island.interactive) {
            const refId = this.emitFile({
              type: "chunk",
              id: `${VIRTUAL_PREFIX}${island.name}`,
              name: `island-${island.name}`,
            });
            chunkRefs.set(island.name, refId);
          }
        }
      }
    },
    configureServer(server) {
      // dev mode: /<manifestFileName> へのリクエストに manifest を JSON で return。
      // chunk path は dev では undefined。 mount loader は fallback で virtual URL
      // (`/@id/__x00__virtual:hibana-island/<Name>`) を dynamic import する。
      server.middlewares.use(`/${manifestFileName}`, (req, res, next) => {
        if (req.method !== "GET") {
          next();
          return;
        }
        res.setHeader("Content-Type", "application/json");
        res.end(`${JSON.stringify(manifest, null, 2)}\n`);
      });
    },
    resolveId(id) {
      if (id === SERVER_ENTRY_ID) return RESOLVED_SERVER_ENTRY;
      if (id.startsWith(VIRTUAL_PREFIX)) {
        return `\0${id}`;
      }
    },
    load(id) {
      // server build entry: 全 island (interactive + static) を import + registry 登録する
      // 1 ファイル。 子 vite.build({ ssr: true }) の input として使われる。
      if (id === RESOLVED_SERVER_ENTRY) {
        const names = Object.keys(islandAbsPath);
        const lines: string[] = [];
        for (const name of names) {
          lines.push(`import { ${name} } from ${JSON.stringify(islandAbsPath[name])};`);
        }
        lines.push('const __hbnReg = (globalThis[Symbol.for("hibana.islands")] ??= {});');
        for (const name of names) {
          lines.push(`__hbnReg[${JSON.stringify(name)}] = ${name};`);
        }
        return { code: `${lines.join("\n")}\n`, moduleSideEffects: "no-treeshake" };
      }

      if (!id.startsWith(RESOLVED_PREFIX)) return;
      const name = id.slice(RESOLVED_PREFIX.length);
      const absPath = islandAbsPath[name];
      if (!absPath) {
        this.error(`[hibana] unknown island "${name}" requested via virtual module`);
      }
      // mount loader は dynamic import で chunk を読み込むだけ。 Component への参照は
      // globalThis registry (`globalThis[Symbol.for("hibana.islands")][name]`) を経由する。
      //
      // 理由: production (Rolldown) で wrapper の `export default Foo` が一切保持されない
      // (mount loader の動的 import が静的解析できないため、 chunk の export は誰にも
      // 使われない dead code と判定されて削除される。 moduleSideEffects: "no-treeshake"
      // でも export を救えない)。 globalThis 代入なら副作用として認識され、 wrapper + Foo
      // 本体まで一緒に保持される。
      const code = [
        `import { ${name} } from ${JSON.stringify(absPath)};`,
        `(globalThis[Symbol.for("hibana.islands")] ??= {})[${JSON.stringify(name)}] = ${name};`,
        "",
      ].join("\n");
      return { code, moduleSideEffects: "no-treeshake" };
    },
    transform(code, id) {
      if (!shouldTransform(id, code)) return;

      try {
        const out = compile(code);
        return { code: out, map: null };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.error(`[hibana] compile error in ${id}: ${msg}`);
      }
    },
    generateBundle() {
      // build 時のみ chunk path を書き戻す。 dev では generateBundle 自体が呼ばれない。
      // server build 側では client manifest を上書きしないように skip (= 子 build は client
      // chunk を持たず、 server bundle 経由でしか component を呼ばないため manifest 不要)。
      if (isSsrBuild) return;
      for (const [name, refId] of chunkRefs) {
        const entry = manifest[name];
        if (!entry) continue;
        entry.chunk = this.getFileName(refId);
      }
      this.emitFile({
        type: "asset",
        fileName: manifestFileName,
        source: `${JSON.stringify(manifest, null, 2)}\n`,
      });
    },
    async closeBundle() {
      // dual bundle SSR: build 完了後、
      //   1. 子 vite.build({ ssr: true }) を起動して、 全 island を集約した server bundle
      //      (`dist/.server/server.mjs`) を作る。 これは Node target / ESM / source-as-is
      //      で、 client bundle に含まれない static island も渡って来る。 Phase 3 で
      //      per-request SSR (Hono integration) するときに再利用するため build 後も残す。
      //   2. happy-dom で document 等を install
      //   3. server bundle を file:// 1 回 import → 副作用で
      //      globalThis[Symbol.for("hibana.islands")] に全 island (interactive + static) が登録
      //   4. dist/index.html の `<hbn-island name="X">` placeholder を見つけて Component
      //      を呼び、 outerHTML を中身に注入。 内部の `<hbn-island/>` も再帰的に同処理
      //   5. index.html を書き戻す
      //
      // 子 build の plugin (isSsrBuild=true) は closeBundle / chunk emit / manifest emit を
      // 全部 skip するので再帰しない。 dev では closeBundle 自体が呼ばれないため SSR skip。
      if (!isBuild) return;
      if (isSsrBuild) return;
      if (Object.keys(manifest).length === 0) return;

      // 1. server bundle を子 invocation で build
      const ssrOutDir = path.resolve(outDir, SERVER_OUT_SUBDIR);
      try {
        await viteBuild({
          root: resolvedRoot,
          configFile: false,
          plugins: [hibana(options)],
          logLevel: "warn",
          build: {
            ssr: true,
            outDir: ssrOutDir,
            emptyOutDir: true,
            rollupOptions: {
              input: SERVER_ENTRY_ID,
              output: { format: "esm", entryFileNames: SERVER_BUNDLE_NAME },
            },
          },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.warn(`[hibana] SSR build failed: ${msg}`);
        return;
      }

      const { Window } = await import("happy-dom");
      const win = new Window();
      const g = globalThis as Record<string | symbol, unknown>;
      const dom = win as unknown as Record<string, unknown>;
      const prev: Record<string, unknown> = {};
      const installKeys = [
        "window",
        "document",
        "HTMLElement",
        "Element",
        "Node",
        "Text",
        "DocumentFragment",
        "NodeFilter",
      ];
      for (const k of installKeys) {
        prev[k] = g[k];
        g[k] = k === "window" ? win : k === "document" ? win.document : dom[k];
      }
      const islandSym = Symbol.for("hibana.islands");
      const prevRegistry = g[islandSym];
      // 前回 build / dev session の残骸を避けて空 registry から始める
      g[islandSym] = {};

      try {
        // 2. server bundle を 1 回 import (静的 import 文経由で全 island が registry 登録)
        const serverBundlePath = path.join(ssrOutDir, SERVER_BUNDLE_NAME);
        // cache bust: 同一プロセス内で再 build した場合の ESM module キャッシュ回避
        const importUrl = `${pathToFileURL(serverBundlePath).href}?t=${Date.now()}`;
        try {
          await import(importUrl);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          this.warn(`[hibana] SSR: failed to import server bundle: ${msg}`);
          return;
        }

        const registry = (g[islandSym] ?? {}) as Record<string, unknown>;

        function ssrRender(name: string, props: Record<string, unknown>, depth: number): string {
          if (depth > 10) return ""; // 循環 island 参照の安全弁
          const Component = registry[name] as ((p: Record<string, unknown>) => unknown) | undefined;
          if (typeof Component !== "function") return "";
          let root: unknown;
          try {
            root = Component(props);
          } catch {
            return "";
          }
          // happy-dom の Element を期待
          const el = root as {
            querySelectorAll?: (s: string) => Iterable<Element>;
            outerHTML?: string;
          };
          if (el.querySelectorAll) {
            for (const ph of Array.from(el.querySelectorAll("hbn-island[name]"))) {
              const childName = ph.getAttribute("name");
              if (!childName) continue;
              const propsStr = ph.getAttribute("data-props");
              const childProps = propsStr ? safeJsonParse(propsStr) : {};
              ph.innerHTML = ssrRender(childName, childProps, depth + 1);
            }
          }
          return el.outerHTML ?? "";
        }

        const indexPath = path.resolve(outDir, "index.html");
        let indexHtml: string;
        try {
          indexHtml = await fs.readFile(indexPath, "utf8");
        } catch {
          this.warn(`[hibana] SSR: index.html not found at ${indexPath}; skipping`);
          return;
        }

        // `<hbn-island name="X" ...></hbn-island>` パターンを再帰 render の結果で埋める。
        // self-closing 形 (`<hbn-island name="X"/>`) は HTML parser が open/close に展開する
        // のが普通だが、 念のため両形式に対応する。
        indexHtml = indexHtml.replace(
          /<hbn-island\b([^>]*?)\s*(?:\/>|>\s*<\/hbn-island>)/g,
          (match, attrs: string) => {
            const nameMatch = /\bname=["']([^"']+)["']/.exec(attrs);
            if (!nameMatch?.[1]) return match;
            const name = nameMatch[1];
            const propsMatch = /\bdata-props=["']([^"']*)["']/.exec(attrs);
            let props: Record<string, unknown> = {};
            if (propsMatch?.[1]) {
              const decoded = decodeHtmlAttr(propsMatch[1]);
              props = safeJsonParse(decoded);
            }
            const html = ssrRender(name, props, 0);
            return `<hbn-island${attrs}>${html}</hbn-island>`;
          },
        );

        await fs.writeFile(indexPath, indexHtml);
      } finally {
        for (const k of installKeys) {
          if (prev[k] === undefined) delete g[k];
          else g[k] = prev[k];
        }
        if (prevRegistry === undefined) delete g[islandSym];
        else g[islandSym] = prevRegistry;
      }
    },
  };
}

function safeJsonParse(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function decodeHtmlAttr(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
