import { defineConfig, type UserConfig } from "vite";
import preact from "@preact/preset-vite";

const config: UserConfig = defineConfig({
  plugins: [preact()],
  root: "src/knowledge/studio/ui",
  build: {
    outDir: "../public/dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3737",
    },
  },
});

export default config;
