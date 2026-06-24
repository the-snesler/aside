import type { Components } from "react-virtuoso";
import type { TimelineRow } from "./timeline";

/** Values Virtuoso threads into its Header/Footer/EmptyPlaceholder slots. */
export interface ListContext {
  loadingOlder: boolean;
  hasMore: boolean;
  hasRows: boolean;
  smartView: boolean;
  emptyState: {
    title: string;
    hint?: string;
  };
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
  const emptyState = context?.emptyState ?? {
    title: context?.smartView
      ? "No notes here yet."
      : "No notes in this channel yet.",
  };

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center px-6 py-10 text-center">
      <p className="text-sm font-medium text-ink/80">{emptyState.title}</p>
      {emptyState.hint && (
        <p className="mt-2 text-sm leading-6 text-muted">{emptyState.hint}</p>
      )}
    </div>
  );
}

export const listComponents: Components<TimelineRow, ListContext> = {
  Header: ListHeader,
  Footer: ListFooter,
  EmptyPlaceholder: ListEmpty,
};
