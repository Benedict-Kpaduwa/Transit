import { defineConfig } from 'vite'
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split the heavy libraries into separate long-cacheable chunks so
        // app-code changes don't invalidate ~2MB of vendor code.
        manualChunks: {
          mapbox: ["mapbox-gl"],
          three: ["three"],
          react: ["react", "react-dom", "@tanstack/react-query"],
        },
      },
    },
  },
})
