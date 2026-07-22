import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: "src/renderer",
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
  },
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        manager: resolve("src/renderer/index.html"),
        overlay: resolve("src/renderer/overlay.html"),
        blank: resolve("src/renderer/blank.html"),
      },
    },
  },
  test: {
    environment: "jsdom",
    include: ["**/*.test.ts"],
  },
});
