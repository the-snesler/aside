import type { Components } from "react-virtuoso";
import type { TimelineRow } from "./timeline";

/** Values Virtuoso threads into its Header/Footer/EmptyPlaceholder slots. */
export interface ListContext {
  loadingOlder: boolean;
  hasMore: boolean;
  hasRows: boolean;
  smartView: boolean;
}

/** Top-of-list status: the older-page spinner, then the start-of-history mark. */
function ListHeader({ context }: { context?: ListContext }) {
  return (
    <div className="pt-3">
      {context?.loadingOlder && (
        <p className="px-2 py-2 text-center text-xs text-muted">
          Loading older notes…
        </p>
      )}
      {context && !context.hasMore && context.hasRows && (
        <p className="px-2 py-2 text-center text-xs text-muted">
          Beginning of history
        </p>
      )}
    </div>
  );
}

/** Breathing room below the newest note so it clears the composer. */
function ListFooter() {
  return <div className="h-3" />;
}

function ListEmpty({ context }: { context?: ListContext }) {
  return (
    <p className="px-2 py-8 text-center text-sm text-muted">
      {context?.smartView
        ? "No notes here yet."
        : "No notes in this channel yet."}
    </p>
  );
}

export const listComponents: Components<TimelineRow, ListContext> = {
  Header: ListHeader,
  Footer: ListFooter,
  EmptyPlaceholder: ListEmpty,
};
