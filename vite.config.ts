import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// Builds the popup UI. public/manifest.json is copied to dist/ by this build.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    // Never wipe dist here: content.js/page.js from the other configs live in
    // it too. The full "build" script cleans dist explicitly instead.
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(__dirname, "popup.html"),
    },
  },
});
