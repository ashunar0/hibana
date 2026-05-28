import { hibana } from "hibana-compiler/vite-plugin";
import { defineConfig } from "vite-plus";

// fullstack-demo: hibana-compiler の dual bundle output を Hono server (server.ts) が読む。
// entry path を固定したいので entryFileNames / chunkFileNames で hash を外す。
export default defineConfig({
  plugins: [hibana()],
  build: {
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
