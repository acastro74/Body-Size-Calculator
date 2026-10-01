import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Body Size Calculator",
        short_name: "SizeCalc",
        description: "Find the right clothing size from one photo.",
        theme_color: "#0f766e",
        background_color: "#ffffff",
        display: "standalone",
        icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
      },
      workbox: {
        // The pose model (~9 MB) and WASM are cached on first use instead of precached.
        globPatterns: ["**/*.{js,css,html,svg}"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          { urlPattern: /\/(models|mediapipe)\//, handler: "CacheFirst", options: { cacheName: "pose-assets" } },
        ],
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  build: { rollupOptions: { input: { main: "index.html", diagnose: "diagnose.html" } } },
  server: { proxy: { "/api": "http://localhost:8787" } },
});
