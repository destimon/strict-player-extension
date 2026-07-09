import { defineConfig } from "vite";
import { resolve } from "path";

// Builds the content script as a single IIFE file (content scripts can't be ES modules).
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, "src/content/content.ts"),
      name: "StrictPlayer",
      formats: ["iife"],
      fileName: () => "content.js",
    },
  },
});
