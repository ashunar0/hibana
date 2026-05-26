import { defineConfig } from "vite-plus/pack";

export default defineConfig({
  entry: ["src/index.ts", "src/vite-plugin/index.ts"],
  dts: {
    tsgo: true,
  },
  exports: true,
});
