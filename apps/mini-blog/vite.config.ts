import tailwindcss from "@tailwindcss/vite";
import { hibana } from "hibana-compiler/vite-plugin";
import { defineConfig } from "vite-plus";

// mini-blog: hibana の bottom-up sample。 fullstack-demo と同じ dual bundle 構成、
// server.ts が dist/.server/server.mjs を読んで SSR + island 焼き込み。
// Tailwind v4 = @tailwindcss/vite plugin で src/main.css の `@import "tailwindcss";` を膨らます。
export default defineConfig({
  plugins: [tailwindcss(), hibana()],
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
