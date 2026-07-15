import { useDrag } from "@use-gesture/react";
import type React from "react";
import { useState, useCallback, useEffect } from "react";
import { SIDEBAR_WIDTH } from "./App";
import type { AsideDatabase } from "./db/database";
import { ChannelSettingsPage } from "./features/channels/ChannelSettingsPage";
import { ChannelSidebar } from "./features/channels/ChannelSidebar";
import { addMessageChannel } from "./features/channels/membership";
import { type Feed, listFeeds } from "./features/feeds/api";
import { useFeedUnread } from "./features/feeds/unread";
import { LightboxProvider } from "./features/lightbox/LightboxProvider";
import { MessageList } from "./features/messages/MessageList";
import { useSearchIndex } from "./features/search/searchIndex";
import { SearchPalette } from "./features/search/SearchPalette";
import { SettingsPage } from "./features/settings/SettingsPage";
import { useNoteCounts, isSmartView, SETTINGS_ID } from "./features/views";

export function Workspace({
  db, view, onSelect, onLogout,
}: {
  db: AsideDatabase;
  view: string;
  onSelect: (view: string) => void;
  onLogout: () => void;
}) {
  const counts = useNoteCounts(db.messages, db.attachments);
  const { channels, search } = useSearchIndex(db);
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [channelSettingsId, setChannelSettingsId] = useState<string | null>(
    null
  );
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(null);
  const { unreadChannelIds, markChannelRead } = useFeedUnread(
    db.messages,
    db.config,
    feeds
  );

  const reloadFeeds = useCallback(async () => {
    setFeeds(await listFeeds());
  }, []);

  useEffect(() => {
    void reloadFeeds().catch(() => undefined);
    function onFocus() {
      void reloadFeeds().catch(() => undefined);
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reloadFeeds]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Finger-tracked drawer: while dragging we drive the offset 1:1 with the
  // finger (clamped to the rail width); on release we snap open/closed on a
  // distance-or-velocity threshold. `drag` being non-null means a gesture is in
  // flight, which also turns the CSS transition off so it tracks instantly.
  const [drag, setDrag] = useState<number | null>(null);
  const bindDrag = useDrag(
    ({ last, movement: [mx], velocity: [vx], direction: [dx] }) => {
      const base = sidebarOpen ? SIDEBAR_WIDTH : 0;
      if (last) {
        setDrag(null);
        if (dx > 0 && (mx > 64 || vx > 0.45)) setSidebarOpen(true);
        else if (dx < 0 && (mx < -64 || vx > 0.45)) setSidebarOpen(false);
        return;
      }
      setDrag(Math.min(SIDEBAR_WIDTH, Math.max(0, base + mx)));
    },
    { axis: "x", filterTaps: true }
  );

  const sidebarOffset = drag ?? (sidebarOpen ? SIDEBAR_WIDTH : 0);
  // The foreground card rounds its corners as it slides aside, matching the
  // phone's screen radius (à la the Claude iOS app). Reset to square on desktop.
  const cardRadius = Math.round((sidebarOffset / SIDEBAR_WIDTH) * 28);

  function selectView(nextView: string) {
    setChannelSettingsId(null);
    if (nextView !== view && !isSmartView(nextView)) {
      void markChannelRead(nextView);
    }
    onSelect(nextView);
    setSidebarOpen(false);
  }

  const handleNavigateToNote = useCallback(
    (channelId: string, messageId: string) => {
      if (channelId !== view) void markChannelRead(channelId);
      onSelect(channelId);
      setSidebarOpen(false);
      setFocusedMessageId(messageId);
    },
    [markChannelRead, onSelect, view]
  );

  const handleDropMessage = useCallback(
    (channelId: string, messageId: string) => {
      void db.messages
        .findOne(messageId)
        .exec()
        .then((message) => {
          if (!message) return;
          const channelIds = addMessageChannel(message, channelId);
          if (channelIds.join("\0") === message.channelIds.join("\0")) return;
          return message.incrementalPatch({
            channelIds,
            updatedAt: Date.now(),
          });
        });
    },
    [db.messages]
  );

  // The sidebar is its own gradient plane; the feed is a separate white card that
  // floats on top of it (a slight overlap, raised z-index + shadow) rather than
  // sharing one rounded container — so the chrome reads as a layer behind the
  // content. On mobile the sidebar sits underneath and the content layer slides
  // aside to expose it.
  return (
    <LightboxProvider>
      <div className="relative flex h-full overflow-hidden md:p-2">
        <ChannelSidebar
          collection={db.channels}
          counts={counts}
          unreadChannelIds={unreadChannelIds}
          selectedView={view}
          onSelect={selectView}
          onOpenSettings={() => selectView(SETTINGS_ID)}
          onOpenChannelSettings={(channelId) => {
            setChannelSettingsId(channelId);
            setSidebarOpen(false);
          }}
          onOpenSearch={() => setPaletteOpen(true)}
          onLogout={onLogout}
          onDropMessage={handleDropMessage}
        />
        <div
          {...bindDrag()}
          className={`relative z-10 flex h-full min-w-0 flex-1 translate-x-(--sidebar-offset) touch-pan-y overflow-hidden rounded-(--card-radius) md:translate-x-0 md:overflow-visible md:rounded-none ${
            drag === null
              ? "transition-[transform,border-radius] duration-200 ease-out"
              : ""
          }`}
          style={
            {
              "--sidebar-offset": `${sidebarOffset}px`,
              "--card-radius": `${cardRadius}px`,
            } as React.CSSProperties
          }
        >
          {channelSettingsId ? (
            <ChannelSettingsPage
              channels={db.channels}
              channelId={channelSettingsId}
              onOpenMenu={() => setSidebarOpen(true)}
              onClose={(nextView) => {
                setChannelSettingsId(null);
                if (nextView) selectView(nextView);
              }}
            />
          ) : view === SETTINGS_ID ? (
            <SettingsPage
              channels={db.channels}
              config={db.config}
              attachments={db.attachments}
              messages={db.messages}
              onOpenMenu={() => setSidebarOpen(true)}
              onFeedsChanged={reloadFeeds}
            />
          ) : (
            <MessageList
              messages={db.messages}
              channels={db.channels}
              embeds={db.embeds}
              attachments={db.attachments}
              view={view}
              counts={counts}
              onOpenMenu={() => setSidebarOpen(true)}
              onOpenSettings={() => selectView(SETTINGS_ID)}
              onOpenSearch={() => setPaletteOpen(true)}
              focusedMessageId={focusedMessageId}
            />
          )}
        </div>
        <SearchPalette
          open={paletteOpen}
          activeView={view}
          channels={channels}
          search={search}
          onClose={() => setPaletteOpen(false)}
          onSelectView={selectView}
          onNavigateToNote={handleNavigateToNote}
        />
      </div>
    </LightboxProvider>
  );
}
