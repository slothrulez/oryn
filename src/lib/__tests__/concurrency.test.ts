import { describe, it, expect } from "vitest";
import { mapWithConcurrency } from "@/lib/concurrency";

describe("mapWithConcurrency", () => {
  it("keeps order + never more than limit running at once (and really concurrent)", async () => {
    let running = 0;
    let maxRunning = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);
    const out = await mapWithConcurrency(items, 3, async (x) => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return x * 2;
    });
    expect(out).toEqual(items.map((x) => x * 2)); // results preserve input order
    expect(maxRunning).toBeLessThanOrEqual(3); // does not exceed concurrency limit
    expect(maxRunning).toBeGreaterThan(1); // actually concurrent (not serial)
  });

  it("passes the index", async () => {
    const out = await mapWithConcurrency(["a", "b", "c"], 2, async (x, i) => `${i}:${x}`);
    expect(out).toEqual(["0:a", "1:b", "2:c"]);
  });

  it("limit above the item count and empty arrays both work", async () => {
    expect(await mapWithConcurrency([1, 2], 10, async (x) => x + 1)).toEqual([2, 3]);
    expect(await mapWithConcurrency([], 4, async (x) => x)).toEqual([]);
  });
});
