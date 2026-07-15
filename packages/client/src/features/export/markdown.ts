import type { AttachmentDoc, ChannelDoc, MessageDoc } from "@aside/shared";
import { messageChannelIds } from "../channels/membership";
import { slugifyChannelName } from "../channels/channelName";

/** One Markdown note, ready to be written into a zip archive. */
export interface ExportFile {
  /** zip-relative path, e.g. "general/1a2b3c4d-....md" */
  path: string;
  content: string;
}

/** Strips path separators and leading dots so an id/name can't escape its folder. */
function safeSegment(value: string): string {
  return value.replace(/[/\\]/g, "_").replace(/^\.+/, "_") || "_";
}

/** Double-quoted YAML scalar — safe for any string, including one with `:` or `"`. */
function yamlString(value: string): string {
  return JSON.stringify(value);
}

/**
 * Serializes one note to a Markdown file: YAML frontmatter (`id`, `date`, the
 * channels it belongs to) followed by the note body. Attachments are emitted
 * as relative links to /api/blobs/<hash> (NOT token-bearing URLs — the file
 * must not leak a session token).
 */
function noteToMarkdown(
  message: MessageDoc,
  channelNames: readonly string[],
  messageAttachments: readonly AttachmentDoc[],
): string {
  const frontmatter = [
    "---",
    `id: ${yamlString(message.id)}`,
    `date: ${yamlString(new Date(message.createdAt).toISOString())}`,
    `channels: [${channelNames.map(yamlString).join(", ")}]`,
    "---",
  ].join("\n");

  const parts = [frontmatter, "", message.text];
  if (messageAttachments.length > 0) {
    const links = messageAttachments.map(
      (attachment) =>
        `- [${attachment.fileName}](/api/blobs/${attachment.blobHash})`,
    );
    parts.push("", links.join("\n"));
  }
  return `${parts.join("\n")}\n`;
}

/**
 * Serializes all notes to one Markdown file per note, grouped into one folder
 * per channel. A note in multiple channels is written once per channel folder
 * (same id, same content) so browsing a channel's folder shows exactly its
 * notes. Filenames are the note's id; a folder falls back to the raw channel
 * id when no {@link ChannelDoc} matches. Pure and deterministic.
 */
export function notesToMarkdownFiles(
  messages: readonly MessageDoc[],
  channels: readonly ChannelDoc[],
  attachments: readonly AttachmentDoc[],
): ExportFile[] {
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

  // 3. one folder slug per channel id, de-duplicated when two channel names
  // collide after slugifying (e.g. "Q&A" and "Q!A" both slugify to "q-a").
  const folderById = new Map<string, string>();
  const usedFolders = new Set<string>();
  for (const channel of channels) {
    let folder = safeSegment(slugifyChannelName(channel.name) || channel.id);
    if (usedFolders.has(folder)) {
      folder = `${folder}-${safeSegment(channel.id).slice(0, 8)}`;
    }
    usedFolders.add(folder);
    folderById.set(channel.id, folder);
  }
  const folderForChannelId = (channelId: string): string =>
    folderById.get(channelId) ??
    safeSegment(slugifyChannelName(channelId) || channelId);

  // 4. one file per note per channel it belongs to
  const files: ExportFile[] = [];
  for (const message of messages) {
    const channelIds = messageChannelIds(message);
    const channelNames = channelIds.map(
      (id) => channelNameById.get(id) ?? id,
    );
    const content = noteToMarkdown(
      message,
      channelNames,
      attachmentsByMessageId.get(message.id) ?? [],
    );
    const fileName = `${safeSegment(message.id)}.md`;
    for (const channelId of channelIds) {
      files.push({ path: `${folderForChannelId(channelId)}/${fileName}`, content });
    }
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}
