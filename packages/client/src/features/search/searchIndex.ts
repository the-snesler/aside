import {
  type AttachmentDoc,
  type ChannelDoc,
  type EmbedDoc,
  type MessageDoc,
} from "@aside/shared";
import MiniSearch, { type SearchResult } from "minisearch";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RxDocument } from "rxdb";
import type { AsideDatabase } from "../../db/database";
import { messageChannelIds } from "../channels/membership";

export type SearchSort = "relevance" | "newest" | "oldest";

export interface SearchOptions {
  scopeChannelId?: string;
  sort: SearchSort;
}

export interface SearchChannel {
  id: string;
  name: string;
}

export interface SearchNote {
  id: string;
  channelIds: string[];
  createdAt: number;
  text: string;
  previewText: string;
  fileNames: string;
  terms: string[];
  score: number;
}

export interface SearchResults {
  channels: SearchChannel[];
  notes: SearchNote[];
}

interface SearchDoc {
  id: string;
  channelIds: string[];
  createdAt: number;
  text: string;
  previewText: string;
  fileNames: string;
}

const SEARCH_OPTIONS = {
  prefix: true,
  fuzzy: 0.2,
  boost: {
    text: 3,
    previewText: 2,
    fileNames: 1,
  },
} as const;

export function useSearchIndex(db: AsideDatabase): {
  channels: SearchChannel[];
  search: (query: string, options: SearchOptions) => SearchResults;
} {
  const [messages, setMessages] = useState<RxDocument<MessageDoc>[]>([]);
  const [embeds, setEmbeds] = useState<RxDocument<EmbedDoc>[]>([]);
  const [attachments, setAttachments] = useState<RxDocument<AttachmentDoc>[]>(
    [],
  );
  const [channels, setChannels] = useState<RxDocument<ChannelDoc>[]>([]);
  const [indexState, setIndexState] = useState<{
    index: MiniSearch<SearchDoc>;
    docs: Map<string, SearchDoc>;
  }>(() => buildIndex([]));

  useEffect(() => {
    const subs = [
      db.messages.find().$.subscribe((found) => setMessages([...found])),
      db.embeds.find().$.subscribe((found) => setEmbeds([...found])),
      db.attachments.find().$.subscribe((found) => setAttachments([...found])),
      db.channels.find().$.subscribe((found) => setChannels([...found])),
    ];
    return () => {
      for (const sub of subs) sub.unsubscribe();
    };
  }, [db]);

  const searchChannels = useMemo(
    () =>
      [...channels]
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((channel) => ({ id: channel.id, name: channel.name })),
    [channels],
  );

  const docs = useMemo(
    () => assembleSearchDocs(messages, embeds, attachments),
    [messages, embeds, attachments],
  );

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setIndexState(buildIndex(docs));
    }, 150);
    return () => window.clearTimeout(handle);
  }, [docs]);

  const channelsRef = useRef(searchChannels);
  const indexRef = useRef(indexState);

  useEffect(() => {
    channelsRef.current = searchChannels;
  }, [searchChannels]);

  useEffect(() => {
    indexRef.current = indexState;
  }, [indexState]);

  const search = useCallback((query: string, options: SearchOptions) => {
    const trimmed = query.trim();
    if (!trimmed) return { channels: [], notes: [] };

    const lower = trimmed.toLowerCase();
    const matchedChannels = channelsRef.current
      .filter((channel) => channel.name.toLowerCase().includes(lower))
      .slice(0, 6);

    const rawResults = indexRef.current.index.search(trimmed, SEARCH_OPTIONS);
    const notes = rawResults
      .map((result) => toSearchNote(result, indexRef.current.docs))
      .filter((note): note is SearchNote => {
        if (!note) return false;
        return (
          !options.scopeChannelId ||
          note.channelIds.includes(options.scopeChannelId)
        );
      });

    return {
      channels: matchedChannels,
      notes: sortNotes(notes, options.sort).slice(0, 30),
    };
  }, []);

  return { channels: searchChannels, search };
}

function assembleSearchDocs(
  messages: RxDocument<MessageDoc>[],
  embeds: RxDocument<EmbedDoc>[],
  attachments: RxDocument<AttachmentDoc>[],
): SearchDoc[] {
  const embedsByMessage = new Map<string, EmbedDoc[]>();
  for (const embed of embeds) {
    const list = embedsByMessage.get(embed.messageId);
    if (list) list.push(embed);
    else embedsByMessage.set(embed.messageId, [embed]);
  }

  const attachmentsByMessage = new Map<string, AttachmentDoc[]>();
  for (const attachment of attachments) {
    const list = attachmentsByMessage.get(attachment.messageId);
    if (list) list.push(attachment);
    else attachmentsByMessage.set(attachment.messageId, [attachment]);
  }

  return messages.map((message) => ({
    id: message.id,
    channelIds: messageChannelIds(message),
    createdAt: message.createdAt,
    text: message.text,
    previewText: (embedsByMessage.get(message.id) ?? [])
      .flatMap((embed) => [embed.title, embed.description, embed.siteName])
      .filter((value): value is string => !!value)
      .join(" "),
    fileNames: (attachmentsByMessage.get(message.id) ?? [])
      .map((attachment) => attachment.fileName)
      .join(" "),
  }));
}

function buildIndex(docs: SearchDoc[]): {
  index: MiniSearch<SearchDoc>;
  docs: Map<string, SearchDoc>;
} {
  const index = new MiniSearch<SearchDoc>({
    fields: ["text", "previewText", "fileNames"],
    storeFields: ["id"],
  });
  index.addAll(docs);
  return {
    index,
    docs: new Map(docs.map((doc) => [doc.id, doc])),
  };
}

function toSearchNote(
  result: SearchResult,
  docs: Map<string, SearchDoc>,
): SearchNote | null {
  const doc = docs.get(String(result.id));
  if (!doc) return null;
  return {
    ...doc,
    terms: result.terms,
    score: result.score,
  };
}

function sortNotes(notes: SearchNote[], sort: SearchSort): SearchNote[] {
  switch (sort) {
    case "newest":
      return [...notes].sort((a, b) => b.createdAt - a.createdAt);
    case "oldest":
      return [...notes].sort((a, b) => a.createdAt - b.createdAt);
    case "relevance":
      return notes;
  }
}
