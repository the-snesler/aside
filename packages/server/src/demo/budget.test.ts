import { describe, expect, it } from "vitest";
import { RollingBudget } from "./index.js";

describe("RollingBudget", () => {
  it("allows up to max within the window, then refuses", () => {
    const budget = new RollingBudget(2, 1000);
    expect(budget.tryConsume(0)).toBe(true);
    expect(budget.tryConsume(100)).toBe(true);
    expect(budget.tryConsume(200)).toBe(false);
  });

  it("frees capacity once entries age past the window", () => {
    const budget = new RollingBudget(2, 1000);
    expect(budget.tryConsume(0)).toBe(true);
    expect(budget.tryConsume(100)).toBe(true);
    expect(budget.tryConsume(500)).toBe(false);
    // The first hit (t=0) is now older than the 1000ms window.
    expect(budget.tryConsume(1001)).toBe(true);
  });
});
