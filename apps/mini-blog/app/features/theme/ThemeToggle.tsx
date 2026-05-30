// @ts-nocheck
// ThemeToggle island = shell (= _layout.tsx) に置く dark / light 切替。
//
// step 5b の主軸: shell に置いた signal state は navigate を跨いで保持される。
// - partial response (navigate.ts) は <main> innerHTML だけ swap、 shell の DOM
//   (= header / nav / footer) は触らない → header 内の <hbn-island name="ThemeToggle">
//   も再 mount されず、 signal は生存し続ける
// - <html class="dark"> も触られないので、 Tailwind `dark:` variant の見た目も保持
//
// 引き算: localStorage 同期は意図的に省略 (= reload 跨ぎ保持は別 articulation、
// 「navigate しても消えない」 を純粋に見せたい)。 初期 state は light 固定 = SSR
// と hydrate で完全一致、 mismatch 0。
import { Signal } from "hibana-core";

export component ThemeToggle() {
  const dark = new Signal(false);

  const onClick = () => {
    dark.value = !dark.value;
    document.documentElement.classList.toggle("dark", dark.value);
  };

  <button
    type="button"
    onClick={onClick}
    class="ml-3 text-sm text-blue-600 dark:text-blue-400 hover:underline"
  >
    {dark.value ? "light mode" : "dark mode"}
  </button>
}
