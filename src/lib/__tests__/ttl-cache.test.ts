import { describe, it, expect } from "vitest";
import { TtlCache } from "@/lib/ttl-cache";
import { stockCacheKey } from "@/lib/providers/stock-registry";

describe("TtlCache", () => {
  it("hits stored keys; unstored keys return undefined", () => {
    const c = new TtlCache<number>(1000, 8);
    c.set("a", 1);
    expect(c.get("a")).toBe(1);
    expect(c.get("missing")).toBeUndefined();
  });

  it("expires after the TTL (injected clock)", () => {
    let t = 0;
    const c = new TtlCache<number>(1000, 8, () => t);
    c.set("a", 1);
    t = 999;
    expect(c.get("a")).toBe(1); // not yet expired
    t = 1001;
    expect(c.get("a")).toBeUndefined(); // expired
  });

  it("over capacity evicts the least recently used (LRU: get refreshes)", () => {
    const c = new TtlCache<number>(10000, 2);
    c.set("a", 1);
    c.set("b", 2);
    c.get("a"); // refresh a to the tail; b becomes the least recently used
    c.set("c", 3); // exceeds capacity 2 → evict b
    expect(c.get("a")).toBe(1);
    expect(c.get("b")).toBeUndefined();
    expect(c.get("c")).toBe(3);
    expect(c.size).toBe(2);
  });
});

describe("stockCacheKey", () => {
  it("same parameters and source → same key; different query/mediaType/source → different keys", () => {
    const k1 = stockCacheKey("beauty serum", { mediaType: "video" }, ["openverse", "wikimedia"]);
    const k2 = stockCacheKey("BEAUTY SERUM ", { mediaType: "video" }, ["wikimedia", "openverse"]); // case/whitespace/source order are irrelevant
    expect(k1).toBe(k2);
    expect(k1).not.toBe(stockCacheKey("beauty serum", { mediaType: "image" }, ["openverse", "wikimedia"]));
    expect(k1).not.toBe(stockCacheKey("other", { mediaType: "video" }, ["openverse", "wikimedia"]));
    expect(k1).not.toBe(stockCacheKey("beauty serum", { mediaType: "video" }, ["openverse"])); // one extra source with a key → different cache key
  });
});
