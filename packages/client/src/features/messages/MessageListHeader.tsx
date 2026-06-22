import type { MessageDoc } from "@aside/shared";
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from "@floating-ui/react";
import { useState } from "react";
import type { RxDocument } from "rxdb";
import IconHash from "~icons/lucide/hash";
import IconImage from "~icons/lucide/image";
import IconLink from "~icons/lucide/link";
import IconList from "~icons/lucide/list";
import IconMenu from "~icons/lucide/menu";
import IconPin from "~icons/lucide/pin";
import IconSearch from "~icons/lucide/search";
import IconSettings from "~icons/lucide/settings";
import IconSparkles from "~icons/lucide/sparkles";
import {
  ALL_ID,
  LINKS_ID,
  PHOTOS_ID,
  TODAY_ID,
  type NoteCounts,
} from "../views";
import { formatTime } from "./timeline";

interface HeaderMeta {
  label: string;
  Icon: typeof IconList;
  count: number;
}

interface Props {
  view: string;
  smartView: boolean;
  channelNames: Map<string, string>;
  /** AI-generated summary of the current channel, shown under the title. */
  description?: string | null;
  pinnedMessages: RxDocument<MessageDoc>[];
  counts: NoteCounts;
  onOpenMenu: () => void;
  onOpenSettings: () => void;
  onOpenSearch: () => void;
  onSelectPinnedMessage: (message: RxDocument<MessageDoc>) => void;
}

export function MessageListHeader({
  view,
  smartView,
  channelNames,
  description,
  pinnedMessages,
  counts,
  onOpenMenu,
  onOpenSettings,
  onOpenSearch,
  onSelectPinnedMessage,
}: Props) {
  const meta = headerMeta(view, channelNames, counts);
  const showPins = !smartView;

  return (
    <>
      {/* Desktop header: current view + count, with the channel description below. */}
      <header className="hidden min-h-14 shrink-0 flex-col justify-center gap-0.5 px-6 py-2 md:flex">
        <div className="flex items-center gap-2.5">
          <meta.Icon className="h-5 w-5 text-accent" />
          <h1 className="text-lg font-semibold text-ink">
            {smartView ? meta.label : `${meta.label}`}
          </h1>
          <span className="text-sm tabular-nums text-muted">{meta.count}</span>
          <div className="grow"></div>
          {showPins && (
            <PinnedMessagesButton
              messages={pinnedMessages}
              onSelect={onSelectPinnedMessage}
            />
          )}
        </div>
        {description && (
          <p
            className="truncate pl-[30px] text-xs text-muted"
            title={description}
          >
            {description}
          </p>
        )}
      </header>

      {/* Mobile header: title row. Navigation lives in the swipe-revealed sidebar. */}
      <div className="shrink-0 px-4 pt-4 md:hidden">
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenMenu}
            aria-label="Open sidebar"
            className="rounded-lg p-1.5 text-muted hover:bg-hover hover:text-ink"
          >
            <IconMenu className="h-5 w-5" />
          </button>
          <h1 className="flex-1 text-lg font-semibold text-ink">
            {smartView ? meta.label : `${meta.label}`}
          </h1>
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="Search"
            className="rounded-lg p-1.5 text-muted hover:bg-hover hover:text-ink"
          >
            <IconSearch className="h-5 w-5" />
          </button>
          {showPins && (
            <PinnedMessagesButton
              messages={pinnedMessages}
              onSelect={onSelectPinnedMessage}
            />
          )}
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Settings"
            className="rounded-lg p-1.5 text-muted hover:bg-hover hover:text-ink"
          >
            <IconSettings className="h-5 w-5" />
          </button>
        </div>
      </div>
    </>
  );
}

function PinnedMessagesButton({
  messages,
  onSelect,
}: {
  messages: RxDocument<MessageDoc>[];
  onSelect: (message: RxDocument<MessageDoc>) => void;
}) {
  const [open, setOpen] = useState(false);
  const floating = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "bottom-end",
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip(), shift({ padding: 8 })],
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    useDismiss(floating.context),
    useRole(floating.context, { role: "dialog" }),
  ]);

  return (
    <>
      <button
        type="button"
        ref={floating.refs.setReference}
        {...getReferenceProps({
          onClick: () => setOpen((value) => !value),
        })}
        aria-label="Pinned messages"
        title="Pinned messages"
        className="relative rounded-lg p-1.5 text-muted hover:bg-hover hover:text-ink"
      >
        <IconPin className="h-4 w-4" />
        {messages.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-ink" />
        )}
      </button>
      {open && (
        <FloatingPortal>
          <div
            ref={floating.refs.setFloating}
            style={floating.floatingStyles}
            {...getFloatingProps()}
            className="z-40 w-80 max-w-[calc(100vw-2rem)] rounded-xl bg-panel p-2 text-sm shadow-xl ring-1 ring-divider"
          >
            {messages.length === 0 ? (
              <p className="px-2 py-4 text-center text-sm text-muted">
                No pinned messages.
              </p>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                {messages.map((message) => (
                  <button
                    key={message.id}
                    type="button"
                    onClick={() => {
                      onSelect(message);
                      setOpen(false);
                    }}
                    className="flex w-full flex-col gap-1 rounded-lg px-2 py-2 text-left hover:bg-hover"
                  >
                    <span className="text-xs tabular-nums text-muted">
                      {formatTime(message.createdAt)}
                    </span>
                    <span className="line-clamp-3 whitespace-pre-wrap text-ink">
                      {message.text || "Attachment note"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

/** Header title, icon, and count for the current view. */
export function headerMeta(
  view: string,
  channelNames: Map<string, string>,
  counts: NoteCounts,
): HeaderMeta {
  switch (view) {
    case ALL_ID:
      return { label: "All Notes", Icon: IconList, count: counts.all };
    case TODAY_ID:
      return { label: "Today", Icon: IconSparkles, count: counts.today };
    case LINKS_ID:
      return { label: "Links", Icon: IconLink, count: counts.links };
    case PHOTOS_ID:
      return { label: "Photos", Icon: IconImage, count: counts.photos };
    default:
      return {
        label: channelNames.get(view) ?? view,
        Icon: IconHash,
        count: counts.byChannel.get(view) ?? 0,
      };
  }
}
