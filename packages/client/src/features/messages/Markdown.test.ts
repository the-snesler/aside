import { describe, expect, it } from "vitest";
import { toggleTaskMarker } from "./Markdown";

// `offset` is the source position of a list item's bullet (what react-markdown
// hands us as `node.position.start.offset`); the helper flips the first task
// marker at or after it.
describe("toggleTaskMarker", () => {
  it("checks an unchecked task", () => {
    expect(toggleTaskMarker("- [ ] buy milk", 0)).toBe("- [x] buy milk");
  });

  it("unchecks a checked task", () => {
    expect(toggleTaskMarker("- [x] buy milk", 0)).toBe("- [ ] buy milk");
    expect(toggleTaskMarker("- [X] buy milk", 0)).toBe("- [ ] buy milk");
  });

  it("toggles only the item at the given offset", () => {
    const source = "- [ ] first\n- [ ] second\n- [ ] third";
    const secondOffset = source.indexOf("- [ ] second");
    expect(toggleTaskMarker(source, secondOffset)).toBe(
      "- [ ] first\n- [x] second\n- [ ] third",
    );
  });

  it("ignores a literal bracket pair earlier in the text", () => {
    // The offset starts at the item's bullet, so a `[ ]` in a prior line's body
    // can't be picked up by mistake.
    const source = "- writes [ ] in prose\n- [ ] real task";
    const offset = source.indexOf("- [ ] real task");
    expect(toggleTaskMarker(source, offset)).toBe(
      "- writes [ ] in prose\n- [x] real task",
    );
  });

  it("returns null when no marker follows the offset", () => {
    expect(toggleTaskMarker("- plain item", 0)).toBeNull();
  });
});
