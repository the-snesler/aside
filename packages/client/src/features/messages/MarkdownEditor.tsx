import { parseReminder } from "@aside/shared";
import Prism from "prismjs";
import "prismjs/components/prism-markdown";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import {
  createEditor,
  Editor,
  Range,
  Text,
  Transforms,
  type NodeEntry,
  type Path,
} from "slate";
import { channelColor } from "../channels/channelMeta";
import { matchChannelMention } from "../channels/channelName";
import {
  continueList,
  slateToString,
  stringToSlate,
  type MentionElement,
} from "./composerMarkdown";
import {
  ChannelMentionDropdown,
  type MentionChannel,
} from "./ChannelMentionDropdown";
import { withHistory } from "slate-history";
import {
  Editable,
  ReactEditor,
  Slate,
  useFocused,
  useSelected,
  withReact,
  type RenderElementProps,
  type RenderLeafProps,
  type RenderPlaceholderProps,
} from "slate-react";

// MD-2: a live-decorated Markdown editor. The raw Markdown stays visible and
// editable; Prism tokenizes each line and `decorate` maps the tokens to styled
// leaves, so `**bold**` reads bold with dimmed `**`, headings grow, etc.
// The styling hints mirror the actual renderer (remark-gfm), not Discord's
// dialect — `__x__` is bold, `~~x~~` is strikethrough. The document contract
// stays a plain Markdown string; Slate is only the editing surface. The one
// structural element is a `#channel` mention (CH-4): an atomic inline void node
// that serializes back to `#name` text. Types + string ⇆ Slate serialization
// live in ./composerMarkdown.

/** Treat `mention` nodes as atomic inline voids (the Slate mentions example). */
function withMentions<T extends Editor>(editor: T): T {
  const { isInline, isVoid, markableVoid } = editor;
  editor.isInline = (element) =>
    element.type === "mention" ? true : isInline(element);
  editor.isVoid = (element) =>
    element.type === "mention" ? true : isVoid(element);
  editor.markableVoid = (element) =>
    element.type === "mention" ? true : markableVoid(element);
  return editor;
}

/** A `#channel` chip: an atomic, non-editable pill the caret skips/deletes whole. */
function MentionChip({ attributes, children, element }: RenderElementProps) {
  const selected = useSelected();
  const focused = useFocused();
  const { channel } = element as MentionElement;
  return (
    <span
      {...attributes}
      contentEditable={false}
      className={`mx-px inline-flex select-none items-center gap-1 rounded-md bg-active px-1.5 py-px align-baseline text-[0.95em] ${
        selected && focused ? "ring-1 ring-accent" : ""
      }`}
    >
      <span
        className="h-2 w-2 shrink-0 rounded-[3px]"
        style={{ backgroundColor: channelColor(channel) }}
      />
      <span>
        <span className="text-muted">#</span>
        {channel}
      </span>
      {children}
    </span>
  );
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
  if (leaf.mention) classes.push("composer-md-mention");
  if (leaf.reminder)
    classes.push(
      "rounded",
      "bg-accent/15",
      "text-accent",
      "ring-1",
      "ring-accent/20",
    );
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
  /**
   * Existing channels for `#tag` autocomplete (CH-4). When provided, typing `#`
   * opens a dropdown of matching channels; omit it to keep the editor plain.
   */
  channels?: MentionChannel[];
  /**
   * Whether a bare Enter submits (default `true`). Set `false` on touch devices,
   * where there's no Shift key to insert a newline: Enter then inserts a break
   * and submission goes through an explicit button instead.
   */
  submitOnEnter?: boolean;
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
    channels,
    submitOnEnter = true,
    className,
  },
  ref,
) {
  const editor = useMemo(
    () => withMentions(withHistory(withReact(createEditor()))),
    [],
  );
  // Read once: Slate owns the value after mount. Callers reset by remounting
  // (a changed `key`), so this never needs to track later prop changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initial = useMemo(() => stringToSlate(initialValue), []);

  // A derived Markdown grammar: a `#tag` chip token (highest precedence) plus an
  // ATX-heading fix so a bare `#tag` never styles as a heading — CommonMark wants
  // a space after the hashes, but Prism's default `#.+` doesn't. The mention
  // token only styles raw `#tag` text mid-type; confirmed mentions are void
  // nodes (rendered by MentionChip), not text. Built once.
  const grammar = useMemo<Prism.Grammar>(() => {
    const base = Prism.languages.markdown as Record<string, Prism.GrammarValue>;
    const title = base.title;
    const fixedTitle = Array.isArray(title)
      ? title.map((rule) =>
          rule instanceof RegExp ||
          !rule.pattern ||
          !rule.pattern.source.includes("#")
            ? rule
            : { ...rule, pattern: /(^\s*)#{1,6}[ \t].+/m },
        )
      : title;
    return {
      mention: { pattern: /(^|\s)#[a-z0-9-]+/, lookbehind: true },
      ...base,
      title: fixedTitle,
    };
  }, []);

  const decorate = useCallback(
    ([node, path]: NodeEntry): Range[] => {
      const ranges: Range[] = [];
      if (!Text.isText(node)) return ranges;
      const tokens = Prism.tokenize(node.text, grammar);
      collectRanges(tokens, path, 0, ranges);
      const reminder = parseReminder(node.text);
      if (reminder) {
        ranges.push({
          reminder: true,
          anchor: { path, offset: reminder.index },
          focus: { path, offset: reminder.end },
        } as unknown as Range);
      }
      return ranges;
    },
    [grammar],
  );

  // CH-4: channel `#tag` autocomplete. `mention` is the in-progress `#partial`
  // token (its Slate range + query); recomputed on every selection change.
  const [mention, setMention] = useState<{
    target: Range;
    query: string;
  } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionPos, setMentionPos] = useState<{
    top: number;
    left: number;
  } | null>(null);

  const matches = useMemo<MentionChannel[]>(() => {
    if (!mention || !channels) return [];
    const q = mention.query;
    return channels
      .filter((c) => c.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 8);
  }, [mention, channels]);

  const mentionOpen =
    mention !== null && matches.length > 0 && mentionPos !== null;

  // Detect a `#partial` being typed at the caret. Each line is one paragraph
  // with a single text child, so the caret offset is the column within the line.
  const onChange = useCallback(() => {
    const { selection } = editor;
    if (
      !channels ||
      channels.length === 0 ||
      !selection ||
      !Range.isCollapsed(selection)
    ) {
      setMention(null);
      return;
    }
    const [point] = Range.edges(selection);
    const lineStart = Editor.start(editor, point.path.slice(0, 1));
    const before = Editor.string(editor, { anchor: lineStart, focus: point });
    const match = matchChannelMention(before);
    if (!match) {
      setMention(null);
      return;
    }
    setMention({
      target: {
        anchor: {
          path: point.path,
          offset: point.offset - match.query.length - 1,
        },
        focus: point,
      },
      query: match.query,
    });
  }, [editor, channels]);

  // Reset the highlight whenever the query changes.
  useEffect(() => {
    setMentionIndex(0);
  }, [mention?.query]);

  // Anchor the dropdown to the caret's DOM rect.
  useEffect(() => {
    if (!mention) {
      setMentionPos(null);
      return;
    }
    try {
      const rect = ReactEditor.toDOMRange(
        editor,
        mention.target,
      ).getBoundingClientRect();
      setMentionPos({ top: rect.top, left: rect.left });
    } catch {
      setMentionPos(null);
    }
  }, [editor, mention]);

  const selectMention = useCallback(
    (name: string) => {
      if (!mention) return;
      // Replace the typed `#partial` with an atomic mention node. Selecting an
      // expanded range makes insertNodes delete it first, then `move` steps the
      // caret past the void so the trailing space lands after the chip.
      Transforms.select(editor, mention.target);
      Transforms.insertNodes(editor, {
        type: "mention",
        channel: name,
        children: [{ text: "" }],
      });
      Transforms.move(editor);
      Transforms.insertText(editor, " ");
      setMention(null);
      ReactEditor.focus(editor);
    },
    [editor, mention],
  );

  const renderLeaf = useCallback(
    (props: RenderLeafProps) => <Leaf {...props} />,
    [],
  );

  const renderElement = useCallback((props: RenderElementProps) => {
    if (props.element.type === "mention") return <MentionChip {...props} />;
    return <p {...props.attributes}>{props.children}</p>;
  }, []);

  // List/checklist continuation (MD-2): on an inserted break, repeat the current
  // line's list marker (numbered markers increment; tasks continue unchecked),
  // or clear an empty item to exit the list. Plain lines just break.
  const handleBreak = useCallback(() => {
    const { selection } = editor;
    if (!selection || !Range.isCollapsed(selection)) {
      editor.insertBreak();
      return;
    }
    const block = Range.edges(selection)[0].path.slice(0, 1);
    const start = Editor.start(editor, block);
    const end = Editor.end(editor, block);
    const cont = continueList(
      Editor.string(editor, { anchor: start, focus: end }),
    );
    if (cont?.kind === "continue") {
      editor.insertBreak();
      editor.insertText(cont.prefix);
    } else if (cont?.kind === "exit") {
      Transforms.delete(editor, { at: { anchor: start, focus: end } });
    } else {
      editor.insertBreak();
    }
  }, [editor]);

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
      // CH-4: when the mention dropdown is open it captures navigation keys so
      // Enter selects a channel instead of sending the note.
      if (mentionOpen) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setMentionIndex((i) => Math.min(i + 1, matches.length - 1));
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setMentionIndex((i) => Math.max(i - 1, 0));
          return;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
          selectMention((matches[mentionIndex] ?? matches[0]).name);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setMention(null);
          return;
        }
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        // On touch (submitOnEnter=false) there's no Shift key, so a bare Enter
        // inserts a newline and sending happens via an explicit button.
        if (submitOnEnter) {
          onSubmit(slateToString(editor.children));
        } else {
          handleBreak();
        }
      } else if (event.key === "Enter" && event.shiftKey) {
        event.preventDefault();
        handleBreak();
      } else if (event.key === "Escape") {
        event.preventDefault();
        onCancel?.();
      }
    },
    [
      editor,
      onSubmit,
      onCancel,
      submitOnEnter,
      mentionOpen,
      matches,
      mentionIndex,
      selectMention,
      handleBreak,
    ],
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
    <Slate editor={editor} initialValue={initial} onChange={onChange}>
      <Editable
        className={className}
        decorate={decorate}
        renderElement={renderElement}
        renderLeaf={renderLeaf}
        renderPlaceholder={renderPlaceholder}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onDrop={onDrop}
        placeholder={placeholder}
        spellCheck
      />
      {mentionOpen && mentionPos && (
        <ChannelMentionDropdown
          items={matches}
          activeIndex={mentionIndex}
          position={mentionPos}
          onSelect={selectMention}
          onHover={setMentionIndex}
        />
      )}
    </Slate>
  );
});
