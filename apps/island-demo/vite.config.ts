import { hibana } from "hibana-compiler/vite-plugin";
import { defineConfig } from "vite-plus";

// island-demo: hibana plugin が build 時に dist/islands.json を生成する
// ことを確認する MVP。 server-render / client mount は次フェーズ。
export default defineConfig({
  plugins: [hibana()],
});
