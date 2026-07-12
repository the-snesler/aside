import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ runFeed: vi.fn() }));
vi.mock("./orchestrator.js", () => ({ runFeed: h.runFeed }));

import { runFeedNow } from "./scheduler.js";

beforeEach(() => h.runFeed.mockReset());

describe("runFeedNow concurrency guard", () => {
  it("skips a concurrent run of the same feed and reports running", async () => {
    // First run: make runFeed hang so the feed stays 'in flight'.
    let release!: (r: unknown) => void;
    h.runFeed.mockReturnValueOnce(
      new Promise((res) => {
        release = res;
      }),
    );

    const first = runFeedNow("feed-1"); // acquires the guard, hangs
    const second = await runFeedNow("feed-1"); // should be skipped

    expect(second).toEqual({
      feedId: "feed-1",
      status: "running",
      written: 0,
      total: 0,
      error: null,
    });
    expect(h.runFeed).toHaveBeenCalledTimes(1);

    // Let the first run finish so the guard clears.
    release({ feedId: "feed-1", status: "ok", written: 3, total: 3, error: null });
    await first;
  });

  it("allows a subsequent run after the previous one finishes", async () => {
    h.runFeed.mockResolvedValue({
      feedId: "feed-1",
      status: "ok",
      written: 0,
      total: 0,
      error: null,
    });
    await runFeedNow("feed-1");
    await runFeedNow("feed-1");
    expect(h.runFeed).toHaveBeenCalledTimes(2); // guard released between runs
  });

  it("runs different feeds concurrently", async () => {
    h.runFeed.mockResolvedValue({
      feedId: "x",
      status: "ok",
      written: 0,
      total: 0,
      error: null,
    });
    await Promise.all([runFeedNow("a"), runFeedNow("b")]);
    expect(h.runFeed).toHaveBeenCalledTimes(2);
  });
});
