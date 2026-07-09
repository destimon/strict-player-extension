import { defineConfig } from "vite";
import { resolve } from "path";

// Builds the MAIN-world page script (YouTube player API bridge) as an IIFE.
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, "src/page/page.ts"),
      name: "StrictPlayerPage",
      formats: ["iife"],
      fileName: () => "page.js",
    },
  },
});
