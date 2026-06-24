import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import Icons from "unplugin-icons/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

function packageName(id: string) {
  const parts = id.split("node_modules/");
  const packagePath = parts[parts.length - 1];
  const [first, second] = packagePath.split("/");

  return first?.startsWith("@") ? `${first}/${second}` : first;
}

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          const pkg = packageName(id);
          if (!pkg) return;

          if (
            [
              "react",
              "react-dom",
              "scheduler",
              "@floating-ui/react",
              "@floating-ui/react-dom",
              "@floating-ui/dom",
              "@floating-ui/core",
              "@floating-ui/utils",
              "@use-gesture/react",
              "@use-gesture/core",
              "react-virtuoso",
              "@juggle/resize-observer",
            ].includes(pkg)
          ) {
            return "vendor-react";
          }

          if (
            [
              "rxdb",
              "rxjs",
              "dexie",
              "event-reduce-js",
              "mingo",
              "broadcast-channel",
              "oblivious-set",
              "custom-idle-queue",
              "array-push-at-sort-position",
              "binary-decision-diagram",
              "unload",
              "is-plain-object",
              "@ungap/structured-clone",
              "zod",
            ].includes(pkg)
          ) {
            return "vendor-db";
          }

          if (
            [
              "react-markdown",
              "remark-breaks",
              "remark-gfm",
              "rehype-highlight",
              "unified",
              "bail",
              "trough",
              "vfile",
              "vfile-message",
              "devlop",
              "property-information",
              "comma-separated-tokens",
              "space-separated-tokens",
              "markdown-table",
              "trim-lines",
              "mdurl",
              "highlight.js",
              "lowlight",
              "prismjs",
            ].includes(pkg) ||
            pkg.startsWith("micromark") ||
            pkg.startsWith("mdast-") ||
            pkg.startsWith("hast-") ||
            pkg.startsWith("unist-") ||
            pkg.startsWith("character-entities")
          ) {
            return "vendor-markdown";
          }

          if (pkg.startsWith("slate")) {
            return "vendor-editor";
          }

          if (pkg === "minisearch") {
            return "vendor-search";
          }

          return;
        },
      },
    },
  },
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
        importScripts: ["push-sw.js"],
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
