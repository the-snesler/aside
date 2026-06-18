import { memo, useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

// Minimal shape of the hast node react-markdown hands each component. We only
// reach for the source position and the synthesized checkbox child.
type HastNode = {
  type: string;
  tagName?: string;
  position?: { start?: { offset?: number } };
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

// Toggle the first GFM task marker (`[ ]` / `[x]`) at or after `offset` in the
// source markdown. The list item's source position starts at its bullet, so the
// next marker is this item's own checkbox — nested children carry their own.
export function toggleTaskMarker(source: string, offset: number): string | null {
  const re = /\[[ xX]\]/g;
  re.lastIndex = offset;
  const match = re.exec(source);
  if (!match) return null;
  const next = match[0] === "[ ]" ? "[x]" : "[ ]";
  return source.slice(0, match.index) + next + source.slice(match.index + 3);
}

// Force links into a new tab. react-markdown's default urlTransform already
// strips dangerous schemes (javascript:, etc.), so this only adds target/rel.
const baseComponents: Components = {
  a: ({ node: _node, ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer" />
  ),
};

// remark-breaks renders a single newline as a hard line break (`<br>`) instead
// of CommonMark's default soft break (collapsed to a space). Matches a chat/notes
// composer, where each Shift+Enter line should survive into the rendered note.
const remarkPlugins = [remarkGfm, remarkBreaks];
const rehypePlugins = [rehypeHighlight];

interface Props {
  text: string;
  className?: string;
  // When provided, GFM task-list checkboxes become clickable: a click flips the
  // marker in the source and reports the rewritten text so the caller can persist
  // it. Omitted (e.g. read-only contexts) leaves the default disabled checkboxes.
  onToggleTask?: (nextText: string) => void;
}

/**
 * Renders a message body as sanitized Markdown (MD-1). react-markdown emits
 * React elements, not an HTML string, and — because we don't enable rehype-raw —
 * any embedded HTML is left inert, so there's no XSS surface. Fenced code blocks
 * get highlight.js token classes via rehype-highlight; the `.message-md`/`.hljs`
 * rules in index.css supply the on-brand dark theme.
 *
 * Memoized so a live RxDB update to one row doesn't re-parse every other body.
 */
export const Markdown = memo(function Markdown({
  text,
  className,
  onToggleTask,
}: Props) {
  const components = useMemo<Components>(() => {
    if (!onToggleTask) return baseComponents;
    return {
      ...baseComponents,
      // Drop the disabled checkbox react-markdown emits for a task item; the `li`
      // override below renders an interactive one in its place.
      input: ({ node: _node, ...props }) =>
        props.type === "checkbox" ? null : <input {...props} />,
      li: ({ node, children, ...props }) => {
        const li = node as HastNode | undefined;
        const checkbox = li?.children?.find(
          (child) => child.type === "element" && child.tagName === "input",
        );
        const offset = li?.position?.start?.offset;
        if (!checkbox || typeof offset !== "number") {
          return <li {...props}>{children}</li>;
        }
        const checked = checkbox.properties?.checked === true;
        return (
          <li {...props}>
            <input
              type="checkbox"
              checked={checked}
              onChange={() => {
                const updated = toggleTaskMarker(text, offset);
                if (updated !== null) onToggleTask(updated);
              }}
              className="cursor-pointer"
            />
            {children}
          </li>
        );
      },
    };
  }, [onToggleTask, text]);

  return (
    <div className={className ? `message-md ${className}` : "message-md"}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
