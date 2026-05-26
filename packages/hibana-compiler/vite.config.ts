import tsdownConfig from "./tsdown.config.ts";

import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: tsdownConfig,
  test: {
    // compiler / vite-plugin は string transform 中心、 DOM 不要
    environment: "node",
  },
});
