import { describe, expect, it } from "vitest";
import {
  clamp,
  hexToHsl,
  hslToHex,
  hueSatToPolar,
  polarToHueSat,
  rotateHue,
} from "./colorMath";

describe("clamp", () => {
  it("bounds to the range", () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-1, 0, 1)).toBe(0);
    expect(clamp(0.4, 0, 1)).toBe(0.4);
  });
});

describe("rotateHue", () => {
  it("wraps into [0, 360)", () => {
    expect(rotateHue(350, 30)).toBe(20);
    expect(rotateHue(10, -30)).toBe(340);
    expect(rotateHue(0, 0)).toBe(0);
  });
});

describe("hex <-> hsl", () => {
  it("round-trips primaries", () => {
    for (const hex of ["#e8478f", "#2dd4bf", "#5865f2", "#ffffff", "#000000"]) {
      const { h, s, l } = hexToHsl(hex);
      expect(hslToHex(h, s, l)).toBe(hex);
    }
  });

  it("parses shorthand and rejects garbage", () => {
    expect(hexToHsl("#fff").l).toBeCloseTo(1);
    expect(hexToHsl("not-a-color")).toEqual({ h: 0, s: 0, l: 0 });
  });

  it("reads pure red as hue 0, full saturation", () => {
    const { h, s } = hexToHsl("#ff0000");
    expect(h).toBe(0);
    expect(s).toBeCloseTo(1);
  });
});

describe("picker field geometry", () => {
  it("is most saturated at the center, zero at the edge", () => {
    expect(polarToHueSat(0, 0, 100).s).toBe(1);
    expect(polarToHueSat(100, 0, 100).s).toBeCloseTo(0);
    expect(polarToHueSat(50, 0, 100).s).toBeCloseTo(0.5);
  });

  it("maps angle to hue", () => {
    expect(polarToHueSat(10, 0, 100).h).toBeCloseTo(0); // east
    expect(polarToHueSat(0, 10, 100).h).toBeCloseTo(90); // south (y down)
  });

  it("round-trips through hueSatToPolar", () => {
    const { dx, dy } = hueSatToPolar(120, 0.4, 100);
    const back = polarToHueSat(dx, dy, 100);
    expect(back.h).toBeCloseTo(120);
    expect(back.s).toBeCloseTo(0.4);
  });
});
