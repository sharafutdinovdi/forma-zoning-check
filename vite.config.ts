import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset paths let the same build serve from any sub-path, e.g. GitHub Pages.
  base: "./",
  server: { host: "localhost", port: 5173, strictPort: true },
});
