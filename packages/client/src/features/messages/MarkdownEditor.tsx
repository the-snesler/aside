import Prism from "prismjs";
import "prismjs/components/prism-markdown";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
} from "react";
import {
  createEditor,
  Editor,
  Node,
  Text,
  Transforms,
  type BaseEditor,
  type Descendant,
  type NodeEntry,
  type Path,
  type Range,
} from "slate";
import { withHistory, type HistoryEditor } from "slate-history";
import {
  Editable,
  ReactEditor,
  Slate,
  withReact,
  type RenderLeafProps,
  type RenderPlaceholderProps,
} from "slate-react";

// MD-2: a live-decorated Markdown editor. The raw Markdown stays visible and
// editable; Prism tokenizes each line and `decorate` maps the tokens to styled
// leaves, so `**bold**` reads bold with dimmed `**`, headings grow, etc.
// The styling hints mirror the actual renderer (remark-gfm), not Discord's
// dialect — `__x__` is bold, `~~x~~` is strikethrough. The document contract
// stays a plain Markdown string; Slate is only the editing surface.

type ParagraphElement = { type: "paragraph"; children: FormattedText[] };
type FormattedText = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  title?: boolean;
  url?: boolean;
  blockquote?: boolean;
  list?: boolean;
  punctuation?: boolean;
};

declare module "slate" {
  interface CustomTypes {
    Editor: BaseEditor & ReactEditor & HistoryEditor;
    Element: ParagraphElement;
    Text: FormattedText;
  }
}

/** A Markdown string ⇆ Slate value: one paragraph per line. */
function stringToSlate(text: string): Descendant[] {
  const lines = text.length ? text.split("\n") : [""];
  return lines.map((line) => ({
    type: "paragraph",
    children: [{ text: line }],
  }));
}

function slateToString(nodes: Descendant[]): string {
  return nodes.map((n) => Node.string(n)).join("\n");
}

/** Visible length of a Prism token, summing any nested content. */
function tokenLength(token: string | Prism.Token): number {
  if (typeof token === "string") return token.length;
  if (typeof token.content === "string") return token.content.length;
  if (Array.isArray(token.content))
    return token.content.reduce<number>((len, t) => len + tokenLength(t), 0);
  return tokenLength(token.content);
}

/**
 * Walk a Prism token stream, pushing a decoration Range per typed token. We
 * recurse into nested content so the inner `punctuation` (e.g. the `**`) gets
 * its own range; Slate merges overlapping ranges, so a marker leaf ends up both
 * `bold` and `punctuation` — bold *and* dimmed.
 */
function collectRanges(
  tokens: Array<string | Prism.Token>,
  path: Path,
  start: number,
  ranges: Range[],
): void {
  let offset = start;
  for (const token of tokens) {
    const length = tokenLength(token);
    if (typeof token !== "string") {
      ranges.push({
        [token.type]: true,
        anchor: { path, offset },
        focus: { path, offset: offset + length },
      } as unknown as Range);
      const content = token.content;
      if (Array.isArray(content)) {
        collectRanges(content, path, offset, ranges);
      } else if (typeof content !== "string") {
        collectRanges([content], path, offset, ranges);
      }
    }
    offset += length;
  }
}

function Leaf({ attributes, children, leaf }: RenderLeafProps) {
  const classes: string[] = [];
  if (leaf.bold) classes.push("font-semibold");
  if (leaf.italic) classes.push("italic");
  if (leaf.strike) classes.push("line-through");
  if (leaf.code) classes.push("composer-md-code");
  if (leaf.title) classes.push("composer-md-title");
  if (leaf.url) classes.push("text-accent", "underline");
  if (leaf.blockquote) classes.push("text-muted", "italic");
  if (leaf.list) classes.push("text-muted");
  if (leaf.punctuation) classes.push("text-muted");
  return (
    <span {...attributes} className={classes.join(" ")}>
      {children}
    </span>
  );
}

interface MarkdownEditorProps {
  initialValue: string;
  placeholder?: string;
  autoFocus?: boolean;
  /** Enter (without shift). Receives the current Markdown string. */
  onSubmit: (text: string) => void;
  /** Escape — used by the inline edit box to bail out. */
  onCancel?: () => void;
  /**
   * Pasted/dropped files (ATT-3). When set, the editor intercepts file paste +
   * drop and hands the files up instead of inserting them as text; the parent
   * owns the upload + pending-attachment tray. Omit it (e.g. the inline edit box)
   * to keep the editor text-only.
   */
  onAddFiles?: (files: File[]) => void;
  /** Box chrome (background, rounding, padding, focus ring). */
  className?: string;
}

/** Imperative handle so an external control (e.g. a send button) can act on the editor. */
export interface MarkdownEditorHandle {
  /** Submit the current text, as if Enter were pressed. */
  submit: () => void;
  /** Move focus into the editor, caret at the end. */
  focus: () => void;
}

export const MarkdownEditor = forwardRef<
  MarkdownEditorHandle,
  MarkdownEditorProps
>(function MarkdownEditor(
  {
    initialValue,
    placeholder,
    autoFocus,
    onSubmit,
    onCancel,
    onAddFiles,
    className,
  },
  ref,
) {
  const editor = useMemo(() => withHistory(withReact(createEditor())), []);
  // Read once: Slate owns the value after mount. Callers reset by remounting
  // (a changed `key`), so this never needs to track later prop changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initial = useMemo(() => stringToSlate(initialValue), []);

  const decorate = useCallback(([node, path]: NodeEntry): Range[] => {
    const ranges: Range[] = [];
    if (!Text.isText(node)) return ranges;
    const tokens = Prism.tokenize(node.text, Prism.languages.markdown);
    collectRanges(tokens, path, 0, ranges);
    return ranges;
  }, []);

  const renderLeaf = useCallback(
    (props: RenderLeafProps) => <Leaf {...props} />,
    [],
  );

  const renderPlaceholder = useCallback(
    ({ children, attributes }: RenderPlaceholderProps) => (
      <span
        {...attributes}
        style={{ ...attributes.style, opacity: 1 }}
        className="text-muted"
      >
        {children}
      </span>
    ),
    [],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      // Don't submit mid-IME composition.
      if (event.nativeEvent.isComposing) return;
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        onSubmit(slateToString(editor.children));
      } else if (event.key === "Enter" && event.shiftKey) {
        event.preventDefault();
        editor.insertBreak();
      } else if (event.key === "Escape") {
        event.preventDefault();
        onCancel?.();
      }
    },
    [editor, onSubmit, onCancel],
  );

  // ATT-3: intercept file paste/drop and hand the files up. Calling
  // preventDefault tells slate-react we handled the event, so it won't also try
  // to insert the file as text. Text paste/drop (no files) falls through.
  const onPaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      if (!onAddFiles) return;
      const files = Array.from(event.clipboardData.files);
      if (files.length === 0) return;
      event.preventDefault();
      onAddFiles(files);
    },
    [onAddFiles],
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!onAddFiles) return;
      const files = Array.from(event.dataTransfer.files);
      if (files.length === 0) return;
      event.preventDefault();
      onAddFiles(files);
    },
    [onAddFiles],
  );

  useImperativeHandle(
    ref,
    () => ({
      submit() {
        onSubmit(slateToString(editor.children));
      },
      focus() {
        try {
          ReactEditor.focus(editor);
          Transforms.select(editor, Editor.end(editor, []));
        } catch {
          // editor DOM not ready — harmless.
        }
      },
    }),
    [editor, onSubmit],
  );

  useEffect(() => {
    if (!autoFocus) return;
    try {
      ReactEditor.focus(editor);
      Transforms.select(editor, Editor.end(editor, []));
    } catch {
      // editor DOM not ready — harmless, skip the caret placement.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Slate editor={editor} initialValue={initial}>
      <Editable
        className={className}
        decorate={decorate}
        renderLeaf={renderLeaf}
        renderPlaceholder={renderPlaceholder}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onDrop={onDrop}
        placeholder={placeholder}
        spellCheck
      />
    </Slate>
  );
});
