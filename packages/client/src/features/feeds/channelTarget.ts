import type { ChannelDoc } from "@aside/shared";
import { sortChannels } from "../channels/channelMeta";
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

export { sortChannels };
