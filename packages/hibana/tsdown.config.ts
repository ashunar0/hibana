import { defineConfig } from "vite-plus/pack";

export default defineConfig({
  entry: ["src/index.ts", "src/factory.ts", "src/server.ts"],
  dts: {
    tsgo: true,
  },
  exports: true,
});
