import type { EmbedDoc } from "@aside/shared";

interface Props {
  embed: EmbedDoc;
}

/**
 * OG-2: a link-preview card for one URL detected in a message. The OpenGraph
 * data is fetched and attached server-side (OG-1) and arrives as a row in the
 * `embeds` collection, so this is purely presentational. Styled to match the
 * app's card surfaces (see FeedSettings) with a Discord-style accent rail.
 */
export function LinkPreviewCard({ embed }: Props) {
  return (
    <a
      href={embed.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1.5 flex max-w-md gap-3 overflow-hidden rounded border border-l-2 border-divider border-l-accent bg-sidebar p-3 no-underline transition-colors hover:bg-hover"
    >
      <div className="min-w-0 flex-1">
        {embed.siteName && (
          <div className="truncate text-xs text-muted">{embed.siteName}</div>
        )}
        {embed.title && (
          <div className="truncate font-medium text-ink">{embed.title}</div>
        )}
        {embed.description && (
          <p className="mt-0.5 line-clamp-2 text-sm text-muted">
            {embed.description}
          </p>
        )}
      </div>
      {embed.image && (
        <img
          src={embed.image}
          alt=""
          loading="lazy"
          // Drop the thumbnail if the remote image fails rather than show a
          // broken-image glyph.
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
          className="h-16 w-16 shrink-0 rounded object-cover"
        />
      )}
    </a>
  );
}
