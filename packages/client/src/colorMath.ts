/**
 * Tiny, dependency-free color helpers for the theme picker. We work in HSL
 * because the picker maps a 2D field to (hue, saturation) and derives companion
 * colors by rotating hue, while lightness is pinned by the light/dark mode.
 * Everything in/out is `#rrggbb` so it drops straight into the palette.
 */

/** Clamp a number into `[min, max]`. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Wrap a hue into `[0, 360)`. */
export function rotateHue(hue: number, deg: number): number {
  return (((hue + deg) % 360) + 360) % 360;
}

/** HSL (`h` 0–360, `s`/`l` 0–1) → `#rrggbb`. */
export function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 1);
  l = clamp(l, 0, 1);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** `#rgb`/`#rrggbb` → HSL (`h` 0–360, `s`/`l` 0–1). Falls back to black. */
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  let raw = hex.trim().replace(/^#/, "");
  if (raw.length === 3) {
    raw = raw
      .split("")
      .map((ch) => ch + ch)
      .join("");
  }
  if (raw.length !== 6 || /[^0-9a-fA-F]/.test(raw)) {
    return { h: 0, s: 0, l: 0 };
  }
  const r = parseInt(raw.slice(0, 2), 16) / 255;
  const g = parseInt(raw.slice(2, 4), 16) / 255;
  const b = parseInt(raw.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

/**
 * Map a point in the picker field to a (hue, saturation). The field is a disc:
 * angle around the center is the hue, and distance from the center is the
 * saturation — **vivid in the middle, washing out toward the neutral edge**.
 * `dx`/`dy` are offsets from the center (screen coords, y pointing down);
 * `radius` is the field's usable radius in the same units.
 */
export function polarToHueSat(
  dx: number,
  dy: number,
  radius: number,
): { h: number; s: number } {
  const dist = Math.sqrt(dx * dx + dy * dy);
  const s = radius <= 0 ? 0 : clamp(1 - dist / radius, 0, 1);
  let h = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { h, s };
}

/**
 * Inverse of {@link polarToHueSat}: place a swatch of a given hue/saturation as
 * an offset from the field center. A saturation of 1 lands at the center, 0 at
 * the edge.
 */
export function hueSatToPolar(
  h: number,
  s: number,
  radius: number,
): { dx: number; dy: number } {
  const dist = (1 - clamp(s, 0, 1)) * radius;
  const rad = (h * Math.PI) / 180;
  return { dx: Math.cos(rad) * dist, dy: Math.sin(rad) * dist };
}
