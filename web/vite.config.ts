import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = fileURLToPath(new URL(".", import.meta.url));

// The signed-in app. Builds into ../dist/web, which Fastify serves at /static/app/.
// In dev, Fastify's page shell loads modules from this server (see src/routes/app.ts).
export default defineConfig({
  root: here,
  base: "/static/app/",
  plugins: [react()],
  build: {
    outDir: "../dist/web",
    emptyOutDir: true,
    // React + motion is ~175 kB gzip: loaded once over the LAN, then cached.
    chunkSizeWarningLimit: 700,
  },
  server: { port: 5173, strictPort: true, host: true, origin: "http://localhost:5173" },
});
