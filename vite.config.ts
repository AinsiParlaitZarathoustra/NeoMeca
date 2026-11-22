import path from "node:path";
import process from "node:process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },

  // Options Vite adaptées à Tauri, appliquées seulement avec `tauri dev` ou `tauri build`.
  // 1. Ne pas masquer les erreurs Rust.
  clearScreen: false,
  // 2. Tauri attend un port fixe : échouer s'il est déjà pris.
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. Ne pas surveiller `src-tauri`.
      ignored: ["**/src-tauri/**"],
    },
  },
}));
