import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import Icons from "unplugin-icons/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    Icons({ compiler: "jsx", jsx: "react" }),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Aside",
        short_name: "Aside",
        description: "A local-first note-taking app.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#fdfbf9",
        theme_color: "#e8478f",
        icons: [
          {
            src: "/aside-app-icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/aside-app-icon.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
      workbox: {
        navigateFallback: "/",
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^\/api\/blobs\/.*/,
            handler: "CacheFirst",
            options: {
              cacheName: "aside-blobs",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
          {
            urlPattern: /^\/api\/.*/,
            handler: "NetworkOnly",
            options: {
              cacheName: "aside-api",
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      // Forward API + SSE to the dev server. SSE rides plain HTTP, no ws needed.
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
