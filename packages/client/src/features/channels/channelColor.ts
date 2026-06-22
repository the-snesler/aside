/**
 * A small fixed palette of pastel-ish accents for the colored square next to
 * each channel in the sidebar. Channels carry no color of their own, so we pick
 * one deterministically from the name — stable across reloads and devices
 * without storing anything.
 */
const PALETTE = [
  "#3ba55d", // green
  "#e9962e", // orange
  "#5865f2", // blue
  "#3aa6b9", // teal
  "#a855f7", // purple
  "#eb459e", // pink
  "#f0b232", // amber
  "#5bbf6a", // lime
];

/** Deterministic accent color for a channel, derived from its name. */
export function channelColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}
