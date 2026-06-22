import { DEFAULT_CHANNEL_ID, type ChannelDoc } from "@aside/shared";

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

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function channelColor(
  channel: string | Pick<ChannelDoc, "name" | "color">,
): string {
  if (
    typeof channel !== "string" &&
    channel.color &&
    HEX_COLOR_RE.test(channel.color)
  ) {
    return channel.color;
  }
  const name = typeof channel === "string" ? channel : channel.name;
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

export function channelType(
  channel: Pick<ChannelDoc, "type">,
): "standard" | "todo" {
  return channel.type === "todo" ? "todo" : "standard";
}

export function pinnedMessageIds(
  channel: Pick<ChannelDoc, "pinnedMessageIds">,
): string[] {
  return Array.isArray(channel.pinnedMessageIds)
    ? channel.pinnedMessageIds
    : [];
}

export function sortChannels<
  T extends Pick<ChannelDoc, "id" | "createdAt" | "sortOrder">,
>(channels: T[]): T[] {
  return [...channels].sort(compareChannels);
}

export function compareChannels<
  T extends Pick<ChannelDoc, "id" | "createdAt" | "sortOrder">,
>(a: T, b: T): number {
  if (a.id === DEFAULT_CHANNEL_ID && a.sortOrder === undefined) return -1;
  if (b.id === DEFAULT_CHANNEL_ID && b.sortOrder === undefined) return 1;
  const aOrder = a.sortOrder;
  const bOrder = b.sortOrder;
  if (aOrder !== undefined && bOrder !== undefined && aOrder !== bOrder) {
    return aOrder - bOrder;
  }
  if (aOrder !== undefined && bOrder === undefined) return -1;
  if (aOrder === undefined && bOrder !== undefined) return 1;
  return a.createdAt - b.createdAt;
}

export function nextSortOrder(
  channels: Pick<ChannelDoc, "sortOrder" | "createdAt">[],
): number {
  const max = channels.reduce((current, channel) => {
    const order = channel.sortOrder ?? channel.createdAt;
    return Math.max(current, order);
  }, 0);
  return max + 1;
}
