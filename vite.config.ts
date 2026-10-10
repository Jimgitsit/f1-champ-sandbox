import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" keeps asset and API URLs relative so the built app works behind the
// nginx prefix (jimmcgowen.com/f1-champ/) and at a bare root alike.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  server: {
    port: 5178,
    proxy: {
      "/api": "http://127.0.0.1:58009",
    },
  },
});
