import { hibana } from "hibana-compiler/vite-plugin";
import { defineConfig } from "vite-plus";

// quiz-hsx: hibana Vite plugin で component / @{ ... } を JS に transform
export default defineConfig({
  plugins: [hibana()],
});
