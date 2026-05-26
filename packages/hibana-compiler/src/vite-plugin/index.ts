import type { Plugin } from "vite";
import { compile } from "../compiler/compile.ts";

/** ファイルが Pattern 3 syntax を含むかの短絡判定。 含まないなら transform skip。 */
export function shouldTransform(id: string, code: string): boolean {
  if (!id.endsWith(".tsx")) return false;
  // node_modules 配下や `?...` query 付きは skip
  if (id.includes("node_modules")) return false;
  return /(?<![.\w])component\s+[A-Z]\w*\s*\(/.test(code);
}

export function hibana(): Plugin {
  return {
    name: "hibana",
    enforce: "pre",
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
  };
}
