import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  // Inline the workspace package so the built server has no workspace-resolution
  // step at runtime. better-sqlite3 (native) and the rest stay external and are
  // provided by `pnpm deploy --prod` in the Docker runtime stage.
  noExternal: ["@aside/shared"],
});
