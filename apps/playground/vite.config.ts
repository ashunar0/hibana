import { hibana } from "hibana-compiler/vite-plugin";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [hibana()],
});
