import { defineConfig } from "vite";

/**
 * Library build: the lab as an importable ES module (web component + mount +
 * registry) for host sites, published beside the static app build. Base
 * matches the site deployment so import.meta.env.BASE_URL-derived asset paths
 * (thumbnails, KaTeX) resolve against the already-published /labs/app/ tree.
 * Kernels stay dynamic imports, so they land as separate chunks loaded on
 * demand relative to the module URL.
 */
export default defineConfig({
  base: "/labs/app/",
  // The app build already publishes public/ (thumbnails) under /labs/app/;
  // copying it into the lib artifact would duplicate megabytes of PNGs.
  publicDir: false,
  build: {
    outDir: "dist-lib",
    lib: {
      entry: "src/app/lib.ts",
      formats: ["es"],
      fileName: () => "emergence-lab.js",
    },
    rollupOptions: {
      output: {
        chunkFileNames: "chunks/[name]-[hash].js",
      },
    },
  },
});
