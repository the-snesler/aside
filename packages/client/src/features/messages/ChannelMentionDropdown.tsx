import { createPortal } from "react-dom";
import { channelColor } from "../channels/channelColor";

export interface MentionChannel {
  id: string;
  name: string;
}

interface Props {
  items: MentionChannel[];
  activeIndex: number;
  /** Caret position in viewport coords; the list floats just above it. */
  position: { top: number; left: number };
  onSelect: (name: string) => void;
  onHover: (index: number) => void;
}

// CH-4: the channel autocomplete list for the composer. Rendered through a
// portal with fixed positioning so it escapes the composer's `overflow-y-auto`
// box, and anchored above the caret since the composer sits at the bottom.
export function ChannelMentionDropdown({
  items,
  activeIndex,
  position,
  onSelect,
  onHover,
}: Props) {
  if (items.length === 0) return null;
  return createPortal(
    <div
      className="fixed z-50 max-h-64 w-56 -translate-y-full overflow-y-auto rounded-xl bg-panel p-1 text-sm shadow-xl ring-1 ring-divider"
      style={{ top: position.top - 6, left: position.left }}
    >
      {items.map((channel, index) => (
        <button
          key={channel.id}
          type="button"
          // Slate keeps DOM focus on the editor; prevent the button from
          // stealing it (and collapsing the selection) before we insert.
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(channel.name);
          }}
          onMouseEnter={() => onHover(index)}
          className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors ${
            index === activeIndex ? "bg-active" : "hover:bg-hover"
          }`}
        >
          <span
            className="h-3 w-3 shrink-0 rounded-[4px]"
            style={{ backgroundColor: channelColor(channel.name) }}
          />
          <span className="min-w-0 flex-1 truncate text-ink">
            <span className="text-muted">#</span> {channel.name}
          </span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
