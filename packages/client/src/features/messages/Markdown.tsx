import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

// Force links into a new tab. react-markdown's default urlTransform already
// strips dangerous schemes (javascript:, etc.), so this only adds target/rel.
const components: Components = {
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
export const Markdown = memo(function Markdown({ text, className }: Props) {
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
