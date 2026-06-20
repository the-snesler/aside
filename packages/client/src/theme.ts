import { useEffect, useState } from "react";
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

/**
 * A dark counterpart to {@link DEFAULT_THEME}. Covers every token so switching
 * presets never leaves a light surface behind. The pink `accent` carries over so
 * the brand reads the same in either mode.
 */
export const DARK_THEME: ThemePalette = {
  // Muted, low-light gradient stops.
  grad1: "#2a1b2e",
  grad2: "#1b2436",
  grad3: "#241b34",
  // Surfaces — dark, slightly tinted.
  rail: "#26222b", // input + code background
  sidebar: "#1c1820", // sidebar base
  chat: "#14111a", // main feed surface
  panel: "#1f1b25", // cards
  hover: "rgba(255,255,255,0.06)",
  active: "#3a2733", // selected nav row / pill
  divider: "rgba(255,255,255,0.10)",
  // Brand + text.
  accent: "#e8478f", // pink — FAB, active icon, links
  ink: "#f2eef5", // primary text
  muted: "#9a92a5", // timestamps, tags, secondary text
  danger: "#f2555a",
};

/**
 * Selectable theme presets shown as swatch tiles in Appearance settings.
 * "Light" and "Dark" are the canonical modes; the rest are colorful variants
 * built by retinting a base palette's gradient + accent.
 */
export const THEME_PRESETS: Array<{
  id: string;
  label: string;
  palette: ThemePalette;
}> = [
  { id: "light", label: "Light", palette: DEFAULT_THEME },
  { id: "dark", label: "Dark", palette: DARK_THEME },
  {
    id: "ocean",
    label: "Ocean",
    palette: {
      ...DARK_THEME,
      grad1: "#13343b",
      grad2: "#0f2a44",
      grad3: "#143a4d",
      accent: "#2dd4bf",
      active: "#173f47",
    },
  },
  {
    id: "forest",
    label: "Forest",
    palette: {
      ...DEFAULT_THEME,
      grad1: "#d6ecd2",
      grad2: "#cfe8df",
      grad3: "#e3eecf",
      sidebar: "#e6f1e1",
      active: "#cfe9cf",
      accent: "#2f9e57",
    },
  },
];

/** Quick-pick accent swatches for the accent color picker. */
export const ACCENT_PRESETS: string[] = [
  "#e8478f", // pink (default)
  "#e5484d", // red
  "#e9962e", // orange
  "#f0b232", // amber
  "#2f9e57", // green
  "#2dd4bf", // teal
  "#5865f2", // blue
  "#a855f7", // purple
];

/** Human-readable labels for each palette token, used by the advanced editor. */
export const TOKEN_LABELS: Record<string, string> = {
  grad1: "Page gradient 1",
  grad2: "Page gradient 2",
  grad3: "Page gradient 3",
  rail: "Input / code surface",
  sidebar: "Sidebar",
  chat: "Feed surface",
  panel: "Cards",
  hover: "Hover overlay",
  active: "Active / selected",
  divider: "Dividers",
  accent: "Accent",
  ink: "Primary text",
  muted: "Secondary text",
  danger: "Danger",
};

/**
 * Tokens that are `#rrggbb` hex (editable with a native color input). The rgba
 * tokens (`hover`, `divider`) are intentionally excluded — a color input can't
 * represent their alpha, so they ride along with presets / reset instead.
 */
export const HEX_TOKENS: string[] = Object.keys(DEFAULT_THEME).filter(
  (key) => !DEFAULT_THEME[key].startsWith("rgba"),
);

/** Write a palette onto `:root` as `--color-<key>` custom properties. */
export function applyTheme(palette: ThemePalette): void {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(palette)) {
    root.style.setProperty(`--color-${key}`, value);
  }
}

/**
 * Persists a palette to the synced `theme` config doc, preserving the original
 * `createdAt` when the doc already exists and bumping `updatedAt` so LWW sees
 * the edit as the latest write. The single write path shared by the editor,
 * preset picker, and reset button.
 */
export async function saveThemePalette(
  config: ConfigCollection,
  palette: ThemePalette,
): Promise<void> {
  const existing = await config.findOne("theme").exec();
  const now = Date.now();
  await config.upsert({
    id: "theme",
    value: JSON.stringify(palette),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
}

/**
 * Reads the current palette from the synced `theme` config doc, merged over
 * {@link DEFAULT_THEME} so a partial/missing doc never yields an undefined
 * token. Re-renders the editor live as the doc changes (incl. cross-device).
 */
export function useThemePalette(config: ConfigCollection | null): ThemePalette {
  const [palette, setPalette] = useState<ThemePalette>(DEFAULT_THEME);
  useEffect(() => {
    if (!config) return;
    const sub = config.findOne("theme").$.subscribe((doc) => {
      if (!doc) {
        setPalette(DEFAULT_THEME);
        return;
      }
      try {
        const parsed = JSON.parse(doc.value) as ThemePalette;
        setPalette({ ...DEFAULT_THEME, ...parsed });
      } catch {
        setPalette(DEFAULT_THEME);
      }
    });
    return () => sub.unsubscribe();
  }, [config]);
  return palette;
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
