import { DEFAULT_CHANNEL_ID } from "@aside/shared";
import { useEffect, useState } from "react";
import { getDatabase, type AsideDatabase } from "./db/database";
import { startReplication } from "./db/replication";
import { ChannelSidebar } from "./features/channels/ChannelSidebar";
import { HOME_ID } from "./features/channels/home";
import { MessageList } from "./features/messages/MessageList";

export function App() {
  const [db, setDb] = useState<AsideDatabase | null>(null);
  // Open on Home — the unified view across every channel.
  const [channelId, setChannelId] = useState<string>(HOME_ID);

  useEffect(() => {
    let active = true;
    void getDatabase().then(async (database) => {
      if (!active) return;
      await ensureDefaultChannel(database);
      startReplication({ collection: database.messages, name: "messages" });
      startReplication({ collection: database.channels, name: "channels" });
      // Embeds are server-authoritative; the client only ever pulls them, so the
      // generic push handler simply never has local changes to send.
      startReplication({ collection: database.embeds, name: "embeds" });
      setDb(database);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!db) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        Loading…
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-[240px_1fr] overflow-hidden">
      <ChannelSidebar
        collection={db.channels}
        selectedId={channelId}
        onSelect={setChannelId}
      />
      <MessageList
        messages={db.messages}
        channels={db.channels}
        embeds={db.embeds}
        channelId={channelId}
      />
    </div>
  );
}

/**
 * Ensures the default channel exists so messages written before there was a
 * channel UI (which carry `channelId: "general"`) have a home. Uses a fixed id
 * and `upsert`, so a race across devices converges through the conflict handler
 * instead of throwing on a duplicate insert.
 */
async function ensureDefaultChannel(db: AsideDatabase): Promise<void> {
  const existing = await db.channels.findOne(DEFAULT_CHANNEL_ID).exec();
  if (existing) return;
  const now = Date.now();
  await db.channels.upsert({
    id: DEFAULT_CHANNEL_ID,
    name: "general",
    createdAt: now,
    updatedAt: now,
  });
}
