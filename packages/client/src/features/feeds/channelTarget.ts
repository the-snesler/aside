import { DEFAULT_CHANNEL_ID, type ChannelDoc } from "@aside/shared";
import { slugifyChannelName } from "../channels/channelName";

export interface FeedChannelTarget {
  channelId?: string;
  channelName: string;
}

export function resolveFeedChannelTarget(
  input: string,
  channels: ChannelDoc[],
): FeedChannelTarget | null {
  const channelName = slugifyChannelName(input);
  if (!channelName) return null;

  const existing = sortChannels(channels).find(
    (channel) => channel.name === channelName,
  );
  return existing ? { channelId: existing.id, channelName } : { channelName };
}

export function sortChannels(channels: ChannelDoc[]): ChannelDoc[] {
  return [...channels].sort((a, b) => {
    if (a.id === DEFAULT_CHANNEL_ID) return -1;
    if (b.id === DEFAULT_CHANNEL_ID) return 1;
    return a.createdAt - b.createdAt;
  });
}
