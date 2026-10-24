import { describe, it, expect, beforeEach } from "vitest";
import {
  parseTrendsRss,
  normalizeGeo,
  formatHotValue,
  cachedTrends,
  clearTrendsCache,
  classifyTrendTitle,
  pickDailyTrend,
  TREND_CATEGORY_IDS,
} from "@/lib/trends";
import type { TrendTopic } from "@/lib/trends";

const SAMPLE = `<?xml version="1.0"?><rss><channel>
<title>Daily Search Trends</title>
<item>
  <title>mstr</title>
  <ht:approx_traffic>2000+</ht:approx_traffic>
  <ht:news_item><ht:news_item_title>Strategy Announces &amp; Reserves Plan</ht:news_item_title></ht:news_item>
</item>
<item>
  <title><![CDATA[world cup results]]></title>
  <ht:approx_traffic>5000+</ht:approx_traffic>
</item>
</channel></rss>`;

describe("parseTrendsRss", () => {
  it("takes only <item>, skipping the channel header title; includes traffic + news context + entity/CDATA decoding", () => {
    const topics = parseTrendsRss(SAMPLE);
    expect(topics.length).toBe(2); // excludes the channel-level "Daily Search Trends" title
    expect(topics[0]).toEqual({ title: "mstr", traffic: "2000+", context: "Strategy Announces & Reserves Plan" });
    expect(topics[1]).toEqual({ title: "world cup results", traffic: "5000+", context: undefined });
  });
  it("empty/no item → empty array", () => {
    expect(parseTrendsRss("<rss><channel><title>x</title></channel></rss>")).toEqual([]);
  });
});

describe("normalizeGeo", () => {
  it("valid two letters → uppercase; invalid → US", () => {
    expect(normalizeGeo("jp")).toBe("JP");
    expect(normalizeGeo("US")).toBe("US");
    expect(normalizeGeo("xyz")).toBe("US");
    expect(normalizeGeo(null)).toBe("US");
  });
});

describe("formatHotValue", () => {
  it("K/M/B tiers + boundaries", () => {
    expect(formatHotValue(11504605)).toBe("11.5M");
    expect(formatHotValue(170276700)).toBe("170M");
    expect(formatHotValue(1_230_000_000)).toBe("1.2B");
    expect(formatHotValue(9999)).toBe("10K");
    expect(formatHotValue(999)).toBe("999");
    expect(formatHotValue(0)).toBe("");
    expect(formatHotValue(NaN)).toBe("");
  });
});

describe("classifyTrendTitle", () => {
  it("real trend samples land in the right category; rule order puts verticals first", () => {
    expect(classifyTrendTitle("Fortnite x Marvel collab")).toBe("game"); // collab is ent-ish → game wins by order
    expect(classifyTrendTitle("pumpkin spice coffee is back")).toBe("food");
    expect(classifyTrendTitle("hurricane path live tracker")).toBe("life");
    expect(classifyTrendTitle("4.9 magnitude earthquake hits coast")).toBe("society");
    expect(classifyTrendTitle("iPhone 17 launch date set")).toBe("tech");
    expect(classifyTrendTitle("volleyball world championship final")).toBe("sports");
    expect(classifyTrendTitle("panda cub debuts at the zoo")).toBe("pets");
    expect(classifyTrendTitle("actor responds to dating rumors")).toBe("ent"); // responds is also society → ent wins by order
  });
  it("no match → null (shown only under all); category id set is stable", () => {
    expect(classifyTrendTitle("offshore wind farm powers oil field")).toBe(null);
    expect(TREND_CATEGORY_IDS.length).toBe(10);
  });
});

describe("pickDailyTrend", () => {
  const board: TrendTopic[] = [
    { title: "hurricane path live tracker", rank: 1 },
    { title: "new lipstick swatches", rank: 2 },
    { title: "skincare ingredient nerds test lipstick", rank: 3 },
    { title: "Fortnite x Marvel collab", rank: 4 },
  ];
  it("scores topics by persona keywords; more hits win, ties go to the higher rank", () => {
    expect(pickDailyTrend(board, "lipstick skincare")).toEqual({ topic: board[2], matched: true }); // 2 hits beats 1 hit
    expect(pickDailyTrend(board, "lipstick")).toEqual({ topic: board[1], matched: true }); // tie → higher rank
  });
  it("no hit → honest fallback to rank 1 with matched=false; empty board → null", () => {
    expect(pickDailyTrend(board, "fishing")).toEqual({ topic: board[0], matched: false });
    expect(pickDailyTrend([], "lipstick")).toBe(null);
  });
  it("tolerant separators: commas, semicolons and spaces mixed", () => {
    expect(pickDailyTrend(board, "fishing, lipstick; camping")?.topic).toBe(board[1]);
  });
});

describe("cachedTrends", () => {
  beforeEach(() => clearTrendsCache());

  it("cache hits within the TTL do not hit the source; different keys fetch separately", async () => {
    let calls = 0;
    const fetcher = async () => {
      calls++;
      return { source: "tiktok", topics: [{ title: "x" }] };
    };
    let t = 0;
    const now = () => t;
    await cachedTrends("cn", fetcher, { now });
    t = 1000;
    await cachedTrends("cn", fetcher, { now });
    expect(calls).toBe(1);
    await cachedTrends("geo:US", fetcher, { now });
    expect(calls).toBe(2);
  });

  it("refetches after the TTL expires; empty results are not cached (transient failures can retry quickly)", async () => {
    let calls = 0;
    let payload: { topics: { title: string }[] } = { topics: [] };
    const fetcher = async () => {
      calls++;
      return payload;
    };
    let t = 0;
    const now = () => t;
    await cachedTrends("cn", fetcher, { now, ttlMs: 100 });
    await cachedTrends("cn", fetcher, { now, ttlMs: 100 });
    expect(calls).toBe(2); // empty → uncached → refetched
    payload = { topics: [{ title: "ok" }] };
    await cachedTrends("cn", fetcher, { now, ttlMs: 100 });
    expect(calls).toBe(3);
    t = 99;
    await cachedTrends("cn", fetcher, { now, ttlMs: 100 });
    expect(calls).toBe(3); // within TTL → cached
    t = 101;
    await cachedTrends("cn", fetcher, { now, ttlMs: 100 });
    expect(calls).toBe(4); // expired → refetched
  });
});
