import IconHash from "~icons/lucide/hash";
import IconImage from "~icons/lucide/image";
import IconLink from "~icons/lucide/link";
import IconList from "~icons/lucide/list";
import IconMenu from "~icons/lucide/menu";
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

interface HeaderMeta {
  label: string;
  Icon: typeof IconList;
  count: number;
}

interface Props {
  view: string;
  smartView: boolean;
  channelNames: Map<string, string>;
  counts: NoteCounts;
  onOpenMenu: () => void;
  onOpenSettings: () => void;
  onOpenSearch: () => void;
}

export function MessageListHeader({
  view,
  smartView,
  channelNames,
  counts,
  onOpenMenu,
  onOpenSettings,
  onOpenSearch,
}: Props) {
  const meta = headerMeta(view, channelNames, counts);

  return (
    <>
      {/* Desktop header: current view + count. */}
      <header className="hidden h-14 shrink-0 items-center gap-2.5 px-6 md:flex">
        <meta.Icon className="h-5 w-5 text-accent" />
        <h1 className="text-lg font-semibold text-ink">
          {smartView ? meta.label : `#${meta.label}`}
        </h1>
        <span className="text-sm tabular-nums text-muted">{meta.count}</span>
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
            {smartView ? meta.label : `#${meta.label}`}
          </h1>
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="Search"
            className="rounded-lg p-1.5 text-muted hover:bg-hover hover:text-ink"
          >
            <IconSearch className="h-5 w-5" />
          </button>
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
