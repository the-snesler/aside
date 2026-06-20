import { useState } from "react";

/**
 * Per-device display preferences. Unlike the theme palette (which syncs through
 * the `config` collection), these are presentation choices that should be able
 * to differ between a phone and a desktop, so they live in `localStorage` and
 * are applied as `data-*` attributes on the document root — CSS in `index.css`
 * keys off those attributes.
 */
export interface DisplaySettings {
  density: "comfortable" | "compact";
  textSize: "small" | "default" | "large";
  reduceMotion: boolean;
}

export const DEFAULT_DISPLAY: DisplaySettings = {
  density: "comfortable",
  textSize: "default",
  reduceMotion: false,
};

const STORAGE_KEY = "aside.display";

/** Read display settings from localStorage, merged over the defaults. */
export function loadDisplay(): DisplaySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_DISPLAY;
    return {
      ...DEFAULT_DISPLAY,
      ...(JSON.parse(raw) as Partial<DisplaySettings>),
    };
  } catch {
    return DEFAULT_DISPLAY;
  }
}

/** Persist display settings to localStorage. */
export function saveDisplay(settings: DisplaySettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private-mode / quota: settings still apply for this session.
  }
}

/** Reflect settings onto `:root` as `data-*` attributes for CSS to key off. */
export function applyDisplay(settings: DisplaySettings): void {
  const root = document.documentElement;
  root.setAttribute("data-density", settings.density);
  root.setAttribute("data-text-size", settings.textSize);
  root.setAttribute("data-reduce-motion", String(settings.reduceMotion));
}

/**
 * Applies stored display settings on mount and returns `[settings, update]`.
 * `update` writes localStorage and re-applies the attributes immediately, so the
 * rest of the app (which reads the same root via CSS) updates live.
 */
export function useDisplay(): [
  DisplaySettings,
  (patch: Partial<DisplaySettings>) => void,
] {
  const [settings, setSettings] = useState<DisplaySettings>(() => {
    const loaded = loadDisplay();
    applyDisplay(loaded);
    return loaded;
  });

  function update(patch: Partial<DisplaySettings>): void {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveDisplay(next);
      applyDisplay(next);
      return next;
    });
  }

  return [settings, update];
}
