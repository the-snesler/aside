import { describe, expect, it } from "vitest";
import { pathToView, viewToPath } from "./routing";
import {
  ALL_ID,
  LINKS_ID,
  PHOTOS_ID,
  SETTINGS_ID,
  TODAY_ID,
} from "./views";

describe("viewToPath", () => {
  it("maps the all-notes view to the root", () => {
    expect(viewToPath(ALL_ID)).toBe("/");
  });

  it("maps smart filters to reserved paths", () => {
    expect(viewToPath(TODAY_ID)).toBe("/today");
    expect(viewToPath(LINKS_ID)).toBe("/links");
    expect(viewToPath(PHOTOS_ID)).toBe("/photos");
    expect(viewToPath(SETTINGS_ID)).toBe("/settings");
  });

  it("maps a channel id to /<id>", () => {
    expect(viewToPath("general")).toBe("/general");
    expect(viewToPath("3f2a-uuid")).toBe("/3f2a-uuid");
  });
});

describe("pathToView", () => {
  it("maps the root to the all-notes view", () => {
    expect(pathToView("/")).toBe(ALL_ID);
    expect(pathToView("")).toBe(ALL_ID);
  });

  it("maps reserved paths back to smart filters", () => {
    expect(pathToView("/today")).toBe(TODAY_ID);
    expect(pathToView("/settings")).toBe(SETTINGS_ID);
  });

  it("treats any other segment as a channel id", () => {
    expect(pathToView("/general")).toBe("general");
    expect(pathToView("/3f2a-uuid")).toBe("3f2a-uuid");
  });

  it("ignores trailing path segments", () => {
    expect(pathToView("/settings/security")).toBe(SETTINGS_ID);
  });
});

describe("round trip", () => {
  it("recovers every view from its path", () => {
    for (const view of [
      ALL_ID,
      TODAY_ID,
      LINKS_ID,
      PHOTOS_ID,
      SETTINGS_ID,
      "general",
      "some-channel-uuid",
    ]) {
      expect(pathToView(viewToPath(view))).toBe(view);
    }
  });
});
