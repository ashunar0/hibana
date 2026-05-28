import fs from "node:fs/promises";
import path from "node:path";
import type { Plugin, ResolvedConfig } from "vite";
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
 */
export interface ManifestEntry {
  source: string;
  line: number;
  props: string[];
  chunk?: string;
}

export type IslandManifest = Record<string, ManifestEntry>;

export interface HibanaPluginOptions {
  /** manifest emit 時のファイル名 (default: "islands.json")。 */
  manifestFileName?: string;
}

const VIRTUAL_PREFIX = "virtual:hibana-island/";
const RESOLVED_PREFIX = `\0${VIRTUAL_PREFIX}`;

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
  let isBuild = false;

  return {
    name: "hibana",
    enforce: "pre",
    configResolved(config: ResolvedConfig) {
      resolvedRoot = config.root;
      isBuild = config.command === "build";
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
          };
          islandAbsPath[island.name] = absFile;

          if (isBuild) {
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
      if (id.startsWith(VIRTUAL_PREFIX)) {
        return `\0${id}`;
      }
    },
    load(id) {
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
      // build 時のみ chunk path を書き戻す。 dev では generateBundle 自体が呼ばれない
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
  };
}
