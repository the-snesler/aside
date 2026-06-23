import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ConfigCollection } from "../../db/database";
import {
  hexToHsl,
  hslToHex,
  hueSatToPolar,
  polarToHueSat,
  rotateHue,
} from "../../colorMath";
import {
  ACCENT_PRESETS,
  applyTheme,
  derivePalette,
  HARMONIES,
  HARMONY_LABELS,
  recipeFromPalette,
  saveThemePalette,
  type Harmony,
  type ThemePalette,
  type ThemeRecipe,
} from "../../theme";
import { Segmented } from "./Segmented";

/** Fraction of the field's half-width the dots are allowed to travel (keeps a
 * dot fully inside the edge). The center is full saturation, the edge zero. */
const FIELD_RADIUS_PCT = 46;

/** A floor on saturation so the picked color always keeps a recoverable hue: a
 * fully-gray color has no hue, which would snap the dot back to 0° on the next
 * render. (derivePalette floors saturation well above this anyway.) */
const MIN_SAT = 0.04;

/**
 * The custom-theme picker. A neutral 2D field maps angle → hue and distance from
 * center → saturation (vivid in the middle); the light/dark mode sets the
 * lightness band. The user drags a single primary color; the chosen harmony
 * spreads the two companion gradient stops automatically. Edits live-preview the
 * whole app immediately and only persist on "Apply".
 */
export function ThemeStudio({
  config,
  palette,
}: {
  config: ConfigCollection;
  palette: ThemePalette;
}) {
  const [recipe, setRecipe] = useState<ThemeRecipe>(() =>
    recipeFromPalette(palette),
  );
  // Whether the user has started editing. Until then we leave the saved palette
  // untouched — a recipe can't always reproduce a hand-tuned theme exactly, so
  // previewing on mount would visibly retint the app just from opening settings.
  const [touched, setTouched] = useState(false);
  const fieldRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const edit = (update: (r: ThemeRecipe) => ThemeRecipe) => {
    setTouched(true);
    setRecipe(update);
  };

  const derived = useMemo(() => derivePalette(recipe), [recipe]);

  // Live-preview the whole app, but only once the user has touched the picker.
  useEffect(() => {
    if (touched) applyTheme(derived);
  }, [derived, touched]);

  // Keep the field in sync with external palette changes (e.g. picking a preset
  // tile) until the user takes over the picker.
  useEffect(() => {
    if (!touched) setRecipe(recipeFromPalette(palette));
  }, [palette, touched]);

  // Revert any unsaved preview when the studio unmounts. Reads the latest saved
  // palette through a ref so the cleanup isn't pinned to a stale value.
  const savedRef = useRef(palette);
  useEffect(() => {
    savedRef.current = palette;
  }, [palette]);
  useEffect(() => () => applyTheme(savedRef.current), []);

  const { h, s } = hexToHsl(recipe.primary);
  const offsets = HARMONIES[recipe.harmony];

  // The three swatches placed on the field: primary (accent) plus the two
  // harmony companions, drawn in their derived gradient colors.
  const dots = [
    { key: "primary", hue: h, color: derived.accent, primary: true },
    { key: "c1", hue: rotateHue(h, offsets[1]), color: derived.grad2 },
    { key: "c2", hue: rotateHue(h, offsets[2]), color: derived.grad3 },
  ];

  function setFromPoint(clientX: number, clientY: number) {
    const field = fieldRef.current;
    if (!field) return;
    const rect = field.getBoundingClientRect();
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    const { h, s } = polarToHueSat(
      dx,
      dy,
      (rect.width * FIELD_RADIUS_PCT) / 100,
    );
    // Store the pick at mid-lightness so hue+saturation round-trip cleanly;
    // derivePalette re-derives the real lightness from the mode. The MIN_SAT
    // floor keeps the hue alive when dragging into the desaturated corners.
    edit((r) => ({ ...r, primary: hslToHex(h, Math.max(s, MIN_SAT), 0.5) }));
  }

  function onPointerDown(e: React.PointerEvent) {
    dragging.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Some environments reject capturing a synthetic pointer; harmless.
    }
    setFromPoint(e.clientX, e.clientY);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (dragging.current) setFromPoint(e.clientX, e.clientY);
  }
  function onPointerUp(e: React.PointerEvent) {
    dragging.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Mirror the capture guard above.
    }
  }

  const dirty = touched && JSON.stringify(derived) !== JSON.stringify(palette);

  function revert() {
    setTouched(false);
    setRecipe(recipeFromPalette(savedRef.current));
    applyTheme(savedRef.current);
  }

  return (
    <div className="rounded-lg border border-divider bg-panel p-4">
      <h3 className="text-sm font-semibold text-ink">Custom theme</h3>

      <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-start">
        {/* The picker field */}
        <div
          ref={fieldRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          role="application"
          aria-label="Theme color field"
          className="relative aspect-square w-full max-w-[16rem] shrink-0 cursor-crosshair touch-none select-none rounded-2xl border border-divider"
          style={{
            backgroundColor: "var(--color-rail)",
            backgroundImage:
              "radial-gradient(var(--color-divider) 1px, transparent 1.2px)",
            backgroundSize: "11px 11px",
          }}
        >
          {dots.map((dot) => {
            const { dx, dy } = hueSatToPolar(dot.hue, s, FIELD_RADIUS_PCT);
            return (
              <span
                key={dot.key}
                className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border shadow-md ${dot.primary
                    ? "h-9 w-9 border-[3px] border-white ring-1 ring-black/10"
                    : "h-6 w-6 border-2 border-white/80"
                  }`}
                style={{
                  left: `${50 + dx}%`,
                  top: `${50 + dy}%`,
                  backgroundColor: dot.color,
                }}
              />
            );
          })}
        </div>

        {/* Controls */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Segmented<ThemeRecipe["mode"]>
            label="Mode"
            value={recipe.mode}
            onChange={(mode) => edit((r) => ({ ...r, mode }))}
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
          <Segmented<Harmony>
            label="Harmony"
            value={recipe.harmony}
            onChange={(harmony) => edit((r) => ({ ...r, harmony }))}
            options={(Object.keys(HARMONIES) as Harmony[]).map((key) => ({
              value: key,
              label: HARMONY_LABELS[key],
            }))}
          />

          {/* Derived swatches + hex of the primary */}
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">Result</span>
            <div className="flex items-center gap-2">
              <span className="flex h-8 flex-1 overflow-hidden rounded-md border border-divider">
                <span
                  className="flex-1"
                  style={{ backgroundColor: derived.grad1 }}
                />
                <span
                  className="flex-1"
                  style={{ backgroundColor: derived.grad2 }}
                />
                <span
                  className="flex-1"
                  style={{ backgroundColor: derived.grad3 }}
                />
                <span
                  className="w-1/3"
                  style={{ backgroundColor: derived.accent }}
                />
              </span>
              <input
                type="text"
                aria-label="Primary hex"
                value={recipe.primary}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  if (/^#?[0-9a-fA-F]{6}$/.test(v)) {
                    edit((r) => ({
                      ...r,
                      primary: v.startsWith("#") ? v : `#${v}`,
                    }));
                  }
                }}
                className="w-24 rounded bg-rail px-2 py-1.5 font-mono text-xs text-ink outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>

          {/* Quick-pick primaries */}
          <div className="flex flex-wrap items-center gap-2">
            {ACCENT_PRESETS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Use ${color} as the primary`}
                onClick={() => edit((r) => ({ ...r, primary: color }))}
                className={`h-7 w-7 rounded-full border transition hover:scale-110 ${recipe.primary.toLowerCase() === color.toLowerCase()
                    ? "border-ink ring-2 ring-accent"
                    : "border-divider"
                  }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          disabled={!dirty}
          onClick={() => void saveThemePalette(config, derived)}
          className="rounded bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          Apply theme
        </button>
        <button
          type="button"
          disabled={!dirty}
          onClick={revert}
          className="rounded border border-divider bg-sidebar px-3 py-2 text-sm font-medium text-ink hover:bg-hover disabled:opacity-50"
        >
          Revert
        </button>
      </div>
    </div>
  );
}
