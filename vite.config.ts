import { defineConfig, type UserConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

const config: UserConfig = defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": new URL("./src/knowledge/studio/ui/src", import.meta.url).pathname,
    },
  },
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
