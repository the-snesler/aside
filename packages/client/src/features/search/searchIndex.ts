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
  color?: string;
}

export interface SearchNote {
  id: string;
  channelIds: string[];
  createdAt: number;
  text: string;
  previewText: string;
  fileNames: string;
  snippetText: string;
  terms: string[];
  score: number;
}

export interface SearchResults {
  channels: SearchChannel[];
  notes: SearchNote[];
}

export interface SearchDoc {
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

export interface SearchIndexState {
  index: MiniSearch<SearchDoc>;
  docs: Map<string, SearchDoc>;
}

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
  const [indexState, setIndexState] = useState<SearchIndexState>(() =>
    buildIndex([]),
  );

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
        .map((channel) => ({
          id: channel.id,
          name: channel.name,
          color: channel.color,
        })),
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

    const notes = searchNotes(indexRef.current, trimmed, options);

    return {
      channels: matchedChannels,
      notes: sortNotes(notes, options.sort).slice(0, 30),
    };
  }, []);

  return { channels: searchChannels, search };
}

export function assembleSearchDocs(
  messages: readonly MessageDoc[],
  embeds: readonly EmbedDoc[],
  attachments: readonly AttachmentDoc[],
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

export function buildIndex(docs: SearchDoc[]): SearchIndexState {
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

export function searchNotes(
  state: SearchIndexState,
  query: string,
  options: { scopeChannelId?: string },
): SearchNote[] {
  return state.index
    .search(query, SEARCH_OPTIONS)
    .map((result) => toSearchNote(result, state.docs))
    .filter((note): note is SearchNote => {
      if (!note) return false;
      return (
        !options.scopeChannelId ||
        note.channelIds.includes(options.scopeChannelId)
      );
    });
}

function toSearchNote(
  result: SearchResult,
  docs: Map<string, SearchDoc>,
): SearchNote | null {
  const doc = docs.get(String(result.id));
  if (!doc) return null;
  return {
    ...doc,
    snippetText: pickSnippetText(doc, result.terms),
    terms: result.terms,
    score: result.score,
  };
}

function pickSnippetText(doc: SearchDoc, terms: string[]): string {
  const candidates = [doc.text, doc.previewText, doc.fileNames].filter(Boolean);
  return (
    candidates.find((candidate) =>
      terms.some((term) => candidate.toLowerCase().includes(term)),
    ) ??
    candidates[0] ??
    ""
  );
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
