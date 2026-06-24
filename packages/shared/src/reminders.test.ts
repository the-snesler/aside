import { describe, expect, it } from "vitest";
import { parseReminder } from "./reminders.js";

const ref = new Date(2026, 5, 22, 12, 0, 0, 0);

describe("parseReminder", () => {
  it("returns null when there is no date phrase", () => {
    expect(parseReminder("remember the thing", ref)).toBeNull();
  });

  it("parses tomorrow as a date-only reminder at 9am", () => {
    expect(parseReminder("send invoice tomorrow", ref)).toMatchObject({
      text: "tomorrow",
      dueAt: new Date(2026, 5, 23, 9, 0, 0, 0).getTime(),
    });
  });

  it("uses a future weekday when parsing with forwardDate", () => {
    const tuesday = new Date(2026, 5, 23, 12, 0, 0, 0);
    expect(parseReminder("follow up Monday", tuesday)).toMatchObject({
      text: "Monday",
      dueAt: new Date(2026, 5, 29, 9, 0, 0, 0).getTime(),
    });
  });

  it("preserves an explicit time", () => {
    expect(parseReminder("call Alex tomorrow at 4:30pm", ref)).toMatchObject({
      text: "tomorrow at 4:30pm",
      dueAt: new Date(2026, 5, 23, 16, 30, 0, 0).getTime(),
    });
  });

  it("returns the matched range for editor highlighting", () => {
    expect(parseReminder("pay rent next Friday", ref)).toMatchObject({
      index: 9,
      end: 20,
    });
  });
});
