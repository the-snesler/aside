import { useEffect } from "react";
import type { ConfigCollection } from "./db/database";

/**
 * The theme palette as a flat color map. Keys are the Tailwind token names from
 * `index.css` (`--color-<key>`), so applying a palette is just writing each as a
 * CSS custom property on `:root`. `grad1/2/3` feed the page background gradient.
 */
export type ThemePalette = Record<string, string>;

/**
 * The Arc-inspired light palette. This is the canonical seed written into the
 * synced `config` collection on first run — at runtime the *config doc* is the
 * source of truth, applied over the matching `@theme` fallbacks in `index.css`
 * (which exist only to avoid a flash before the doc loads). Editing the synced
 * doc retints the whole app, no code change required.
 */
export const DEFAULT_THEME: ThemePalette = {
  // Page gradient stops: pink (top-left) → blue (bottom-left) → lavender (right).
  grad1: "#f8cbde",
  grad2: "#bdd4f1",
  grad3: "#dcc6f0",
  // Surfaces.
  rail: "#f1edf4", // input + code background
  sidebar: "#fbe7f0", // sidebar base (a gradient overlays it in the component)
  chat: "#fdfbf9", // main feed surface
  panel: "#ffffff", // cards
  hover: "rgba(20,12,24,0.045)",
  active: "#fbd9e8", // selected nav row / pill
  divider: "rgba(20,12,24,0.08)",
  // Brand + text.
  accent: "#e8478f", // pink — FAB, active icon, links
  ink: "#26222b", // primary text
  muted: "#8d8795", // timestamps, tags, secondary text
  danger: "#e5484d",
};

/** Write a palette onto `:root` as `--color-<key>` custom properties. */
export function applyTheme(palette: ThemePalette): void {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(palette)) {
    root.style.setProperty(`--color-${key}`, value);
  }
}

/**
 * Subscribes to the synced `theme` config doc and applies it at runtime. Seeds
 * the doc with {@link DEFAULT_THEME} the first time it's missing (so a fresh
 * install — or a second device — converges on one palette). Unknown/partial
 * palettes are merged over the defaults so a missing key never blanks a color.
 */
export function useTheme(config: ConfigCollection | null): void {
  useEffect(() => {
    if (!config) return;
    const sub = config.findOne("theme").$.subscribe((doc) => {
      if (!doc) {
        const now = Date.now();
        void config.upsert({
          id: "theme",
          value: JSON.stringify(DEFAULT_THEME),
          createdAt: now,
          updatedAt: now,
        });
        return;
      }
      try {
        const parsed = JSON.parse(doc.value) as ThemePalette;
        applyTheme({ ...DEFAULT_THEME, ...parsed });
      } catch {
        applyTheme(DEFAULT_THEME);
      }
    });
    return () => sub.unsubscribe();
  }, [config]);
}
