import type { AttachmentDoc, ChannelDoc, MessageDoc } from "@aside/shared";
import { messageChannelIds } from "../channels/membership";

/**
 * Serializes all notes to a single Markdown document, grouped by channel.
 * Pure and deterministic. A note in multiple channels appears under each.
 * Attachments are emitted as relative links to /api/blobs/<hash> (NOT
 * token-bearing URLs — the file must not leak a session token).
 */
export function notesToMarkdown(
  messages: readonly MessageDoc[],
  channels: readonly ChannelDoc[],
  attachments: readonly AttachmentDoc[],
): string {
  const title = "# Aside notes\n";
  if (messages.length === 0) return title;

  // 1. attachments by messageId
  const attachmentsByMessageId = new Map<string, AttachmentDoc[]>();
  for (const attachment of attachments) {
    const list = attachmentsByMessageId.get(attachment.messageId);
    if (list) {
      list.push(attachment);
    } else {
      attachmentsByMessageId.set(attachment.messageId, [attachment]);
    }
  }

  // 2. channel display-name lookup by id (fallback: the id itself)
  const channelNameById = new Map<string, string>();
  for (const channel of channels) {
    channelNameById.set(channel.id, channel.name);
  }

  // 3. group messages by each of their channel ids (via messageChannelIds)
  const messagesByChannelId = new Map<string, MessageDoc[]>();
  for (const message of messages) {
    for (const channelId of messageChannelIds(message)) {
      const list = messagesByChannelId.get(channelId);
      if (list) {
        list.push(message);
      } else {
        messagesByChannelId.set(channelId, [message]);
      }
    }
  }

  // 4. sort group keys by display name (localeCompare); messages by createdAt asc
  const channelIds = [...messagesByChannelId.keys()].sort((a, b) =>
    (channelNameById.get(a) ?? a).localeCompare(channelNameById.get(b) ?? b),
  );

  const sections = channelIds.map((channelId) => {
    const channelName = channelNameById.get(channelId) ?? channelId;
    const channelMessages = [...messagesByChannelId.get(channelId)!].sort(
      (a, b) => a.createdAt - b.createdAt,
    );

    const messageBlocks = channelMessages.map((message) => {
      const heading = `### ${new Date(message.createdAt).toISOString()}`;
      const messageAttachments = attachmentsByMessageId.get(message.id) ?? [];
      const parts = [heading, "", message.text];
      if (messageAttachments.length > 0) {
        const links = messageAttachments.map(
          (attachment) =>
            `- [${attachment.fileName}](/api/blobs/${attachment.blobHash})`,
        );
        parts.push("", links.join("\n"));
      }
      return parts.join("\n");
    });

    return [`## #${channelName}`, "", messageBlocks.join("\n\n")].join("\n");
  });

  return `${title}\n${sections.join("\n\n")}\n`;
}
