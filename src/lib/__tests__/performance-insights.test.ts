import { describe, it, expect } from "vitest";
import { aggregateByStyle, topConvertingStyle, aggregateByHook, topConvertingHook, buildPerformanceHint, type MetricInput } from "@/lib/performance-insights";

const recs: MetricInput[] = [
  { style: "pain_point", views: 10000, likes: 500, comments: 100, shares: 50, orders: 80 },
  { style: "pain_point", views: 20000, likes: 1000, comments: 200, shares: 100, orders: 200 },
  { style: "comparison", views: 10000, likes: 200, comments: 20, shares: 10, orders: 30 },
];

describe("aggregateByStyle", () => {
  it("groups by style, computes avg/rates, sorts by conversion rate descending", () => {
    const agg = aggregateByStyle(recs);
    expect(agg.map((i) => i.style)).toEqual(["pain_point", "comparison"]); // pain_point has higher conversion rate, ranked first
    const pp = agg[0];
    expect(pp.samples).toBe(2);
    expect(pp.avgViews).toBe(15000); // (10000+20000)/2
    expect(pp.totalOrders).toBe(280);
    expect(pp.conversionRate).toBeCloseTo(280 / 30000, 6); // orders / views
    expect(pp.engagementRate).toBeCloseTo(1950 / 30000, 6); // (likes + comments + shares) / views
  });

  it("0 views does not divide by zero (rate=0)", () => {
    const agg = aggregateByStyle([{ style: "x", views: 0, orders: 5 }]);
    expect(agg[0].conversionRate).toBe(0);
    expect(agg[0].engagementRate).toBe(0);
    expect(agg[0].avgViews).toBe(0);
  });

  it("empty input → empty array", () => {
    expect(aggregateByStyle([])).toEqual([]);
  });

  it("missing fields count as 0 without throwing", () => {
    const agg = aggregateByStyle([{ style: "y", views: 100 }]);
    expect(agg[0].totalOrders).toBe(0);
    expect(agg[0].conversionRate).toBe(0);
  });
});

describe("topConvertingStyle", () => {
  it("recommends only after the minimum sample count (default 2)", () => {
    const top = topConvertingStyle(recs); // pain_point has 2 samples
    expect(top?.style).toBe("pain_point");
  });

  it("insufficient samples → null (no misleading advice)", () => {
    expect(topConvertingStyle(recs, 3)).toBeNull(); // no style reaches 3 samples
    expect(topConvertingStyle([{ style: "comparison", views: 10000, orders: 30 }], 2)).toBeNull(); // only 1 sample
  });

  it("all-zero conversions → null", () => {
    expect(topConvertingStyle([
      { style: "a", views: 100, orders: 0 },
      { style: "a", views: 200, orders: 0 },
    ])).toBeNull();
  });
});

describe("aggregateByHook / topConvertingHook (hook A/B feedback)", () => {
  const recs: MetricInput[] = [
    { style: "x", hookId: "visual_shock", views: 10000, orders: 100 },
    { style: "x", hookId: "visual_shock", views: 10000, orders: 120 },
    { style: "x", hookId: "suspense", views: 10000, orders: 30 },
    { style: "x", views: 10000, orders: 50 }, // no hookId, skipped
  ];

  it("aggregates by hookId, skips missing hookIds, sorts by conversion rate descending", () => {
    const agg = aggregateByHook(recs);
    expect(agg.map((i) => i.hookId)).toEqual(["visual_shock", "suspense"]);
    expect(agg[0].samples).toBe(2);
    expect(agg[0].conversionRate).toBeCloseTo(220 / 20000, 6);
  });

  it("topConvertingHook needs enough samples", () => {
    expect(topConvertingHook(recs)?.hookId).toBe("visual_shock");
    expect(topConvertingHook(recs, 3)).toBeNull();
  });

  it("style aggregation is unaffected by hookId (backward compatible, 4 same-style records counted)", () => {
    expect(aggregateByStyle(recs)[0].style).toBe("x");
    expect(aggregateByStyle(recs)[0].samples).toBe(4);
  });
});

describe("buildPerformanceHint (data flywheel feedback directive)", () => {
  it("style + hook → a titled two-line directive using the label resolvers", () => {
    const topStyle = topConvertingStyle(recs)!;
    const topHook = topConvertingHook([
      { style: "x", hookId: "visual_shock", views: 10000, orders: 100 },
      { style: "x", hookId: "visual_shock", views: 10000, orders: 120 },
    ])!;
    const hint = buildPerformanceHint(topStyle, topHook, {
      styleLabel: (s) => (s === "pain_point" ? "Pain-point seeding" : s),
      hookLabel: (h) => (h === "visual_shock" ? "Visual shock" : h),
    });
    expect(hint).toContain("HISTORICAL CONVERSION FEEDBACK");
    expect(hint).toContain("Pain-point seeding");
    expect(hint).toContain("Visual shock");
    expect(hint.split("\n").length).toBe(3); // header + 2 bullets
  });

  it("cold start (both null) → empty string, the caller injects nothing", () => {
    expect(buildPerformanceHint(null, null)).toBe("");
  });

  it("style only → one line; without a label resolver falls back to the raw key", () => {
    const topStyle = topConvertingStyle(recs)!;
    const hint = buildPerformanceHint(topStyle, null);
    expect(hint).toContain(topStyle.style); // raw key fallback
    expect(hint).not.toContain("opening hook");
  });

  it("conversion rate is shown as a percentage (one decimal)", () => {
    // 220/20000 = 1.1%
    const hint = buildPerformanceHint(
      { style: "s", samples: 2, avgViews: 10000, engagementRate: 0, conversionRate: 220 / 20000, totalOrders: 220 },
      null
    );
    expect(hint).toContain("1.1%");
  });
});
