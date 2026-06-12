export interface SnippetPart {
  text: string;
  match: boolean;
}

export interface Snippet {
  parts: SnippetPart[];
  prefix: boolean;
  suffix: boolean;
}

const SNIPPET_RADIUS = 64;

export function buildSnippet(text: string, terms: string[]): Snippet {
  const normalizedTerms = normalizeTerms(terms);
  const first = findFirstMatch(text, normalizedTerms);
  if (first === -1) {
    const slice = text.slice(0, SNIPPET_RADIUS * 2).trim();
    return {
      parts: [{ text: slice || text, match: false }],
      prefix: false,
      suffix: text.length > slice.length,
    };
  }

  const start = Math.max(0, first - SNIPPET_RADIUS);
  const end = Math.min(text.length, first + SNIPPET_RADIUS);
  const window = text.slice(start, end).trim();
  const offset = text.indexOf(window, start);

  return {
    parts: highlightTerms(window, normalizedTerms),
    prefix: offset > 0,
    suffix: offset + window.length < text.length,
  };
}

function normalizeTerms(terms: string[]): string[] {
  return [...new Set(terms.map((term) => term.trim().toLowerCase()))]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
}

function findFirstMatch(text: string, terms: string[]): number {
  const lower = text.toLowerCase();
  let first = -1;
  for (const term of terms) {
    const index = lower.indexOf(term);
    if (index !== -1 && (first === -1 || index < first)) first = index;
  }
  return first;
}

function highlightTerms(text: string, terms: string[]): SnippetPart[] {
  if (terms.length === 0) return [{ text, match: false }];

  const parts: SnippetPart[] = [];
  const lower = text.toLowerCase();
  let index = 0;

  while (index < text.length) {
    const term = terms.find((candidate) => lower.startsWith(candidate, index));
    if (!term) {
      const next = nextMatchIndex(lower, terms, index + 1);
      const end = next === -1 ? text.length : next;
      parts.push({ text: text.slice(index, end), match: false });
      index = end;
    } else {
      parts.push({ text: text.slice(index, index + term.length), match: true });
      index += term.length;
    }
  }

  return mergeAdjacent(parts);
}

function nextMatchIndex(text: string, terms: string[], from: number): number {
  let next = -1;
  for (const term of terms) {
    const index = text.indexOf(term, from);
    if (index !== -1 && (next === -1 || index < next)) next = index;
  }
  return next;
}

function mergeAdjacent(parts: SnippetPart[]): SnippetPart[] {
  const merged: SnippetPart[] = [];
  for (const part of parts) {
    const prev = merged[merged.length - 1];
    if (prev && prev.match === part.match) prev.text += part.text;
    else merged.push({ ...part });
  }
  return merged;
}
