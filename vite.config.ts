import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    // Pattern 3 syntax (component / render) を含むファイルは oxfmt / oxlint の
    // parser を通らないので除外。 Vite plugin (hibana) が transform するので
    // 動作には影響なし (Phase 2 で .hsx 拡張子 + 専用 fmt/lint 設定に移行予定)
    // oxlint-disable-next-line typescript/no-explicit-any -- staged 関数形式の型が定義されてないので cast
    "*": ((files: string[]) => {
      const filtered = files.filter(
        (f) => !f.endsWith("pattern3-demo.tsx") && !f.endsWith("quiz-hsx/src/App.tsx"),
      );
      if (filtered.length === 0) return [];
      return [`vp check --fix ${filtered.map((f) => `"${f}"`).join(" ")}`];
    }) as any,
  },
  lint: { options: { typeAware: true, typeCheck: true } },
});
