import { DEFAULT_CHANNEL_ID, type MessageDoc } from "@aside/shared";

export function normalizeChannelIds(ids: readonly string[]): string[] {
  const unique = [...new Set(ids.filter(Boolean))];
  return unique.length > 0 ? unique : [DEFAULT_CHANNEL_ID];
}

export function messageChannelIds(message: MessageDoc): string[] {
  return normalizeChannelIds(message.channelIds);
}

export function messageHasChannel(message: MessageDoc, channelId: string) {
  return messageChannelIds(message).includes(channelId);
}

export function addMessageChannel(
  message: MessageDoc,
  channelId: string,
): string[] {
  return normalizeChannelIds([...messageChannelIds(message), channelId]);
}

export function removeMessageChannel(
  message: MessageDoc,
  channelId: string,
): string[] {
  return normalizeChannelIds(
    messageChannelIds(message).filter((id) => id !== channelId),
  );
}
