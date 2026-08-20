import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development Vite (5273) proxies /api to Express (4100) so cookies stay
// same-origin. In production the server serves the built client itself.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5273,
    proxy: { "/api": { target: "http://localhost:4100", changeOrigin: false } },
  },
  build: { outDir: "dist", sourcemap: false },
});
