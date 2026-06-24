import { casual } from "chrono-node";

export interface ParsedReminder {
  /** ms epoch due time in the local timezone used by the parser */
  dueAt: number;
  /** matched date phrase in the source text */
  text: string;
  /** inclusive start offset in the source text */
  index: number;
  /** exclusive end offset in the source text */
  end: number;
}

/**
 * Parse the first reminder-like date phrase in a note. Date-only phrases default
 * to 9:00 AM; explicit date/time phrases keep the parsed time.
 */
export function parseReminder(
  text: string,
  reference = new Date(),
): ParsedReminder | null {
  const result = casual.parse(text, reference, { forwardDate: true })[0];
  if (!result) return null;

  const date = result.start.date();
  if (!result.start.isCertain("hour")) {
    date.setHours(9, 0, 0, 0);
  }

  return {
    dueAt: date.getTime(),
    text: result.text,
    index: result.index,
    end: result.index + result.text.length,
  };
}
