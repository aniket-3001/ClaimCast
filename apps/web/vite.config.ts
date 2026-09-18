import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * In development the client and the API are same-origin, because everything
 * under /api is proxied to the server on 3101. That keeps CORS out of the
 * development loop entirely and means the client never needs to know a host:
 * the one place a deployed build learns one is VITE_API_URL.
 *
 * 3101 rather than 3001 because 3001 was taken on the machine this was set up
 * on, the same reason Postgres sits on 5434.
 */
const API = process.env.VITE_API_PROXY ?? "http://localhost:3101";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: { "/api": { target: API, changeOrigin: true } },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
