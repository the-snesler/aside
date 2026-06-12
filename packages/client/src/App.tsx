import { DEFAULT_CHANNEL_ID } from "@aside/shared";
import { useEffect, useState } from "react";
import { getDatabase, type AsideDatabase } from "./db/database";
import { startReplication } from "./db/replication";
import { ChannelSidebar } from "./features/channels/ChannelSidebar";
import { FeedSettings } from "./features/feeds/FeedSettings";
import { MessageList } from "./features/messages/MessageList";
import { ALL_ID, useNoteCounts } from "./features/views";
import { useTheme } from "./theme";

export function App() {
  const [db, setDb] = useState<AsideDatabase | null>(null);
  // Open on "All Notes" — the unified view across every space.
  const [view, setView] = useState<string>(ALL_ID);

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
      startReplication({
        collection: database.attachments,
        name: "attachments",
      });
      // Synced theme palette + future settings.
      startReplication({ collection: database.config, name: "config" });
      setDb(database);
    });
    return () => {
      active = false;
    };
  }, []);

  // Apply the synced theme as soon as the config collection exists; no-op until then.
  useTheme(db?.config ?? null);

  if (!db) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        Loading…
      </div>
    );
  }

  return <Workspace db={db} view={view} onSelect={setView} />;
}

function Workspace({
  db,
  view,
  onSelect,
}: {
  db: AsideDatabase;
  view: string;
  onSelect: (view: string) => void;
}) {
  const counts = useNoteCounts(db.messages, db.attachments);
  // The settings modal is shared: opened from the sidebar gear (desktop) and the
  // feed header gear (mobile), so it lives here rather than in either child.
  const [settingsOpen, setSettingsOpen] = useState(false);

  // The sidebar is its own gradient plane; the feed is a separate white card that
  // floats on top of it (a slight overlap, raised z-index + shadow) rather than
  // sharing one rounded container — so the chrome reads as a layer behind the
  // content. On mobile the sidebar is hidden and the feed fills the screen.
  return (
    <div className="flex h-full md:p-2">
      <ChannelSidebar
        collection={db.channels}
        counts={counts}
        selectedView={view}
        onSelect={onSelect}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <MessageList
        messages={db.messages}
        channels={db.channels}
        embeds={db.embeds}
        attachments={db.attachments}
        view={view}
        onSelectView={onSelect}
        counts={counts}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <FeedSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        channels={db.channels}
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
