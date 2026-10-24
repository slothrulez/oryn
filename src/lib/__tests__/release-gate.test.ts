import { describe, it, expect } from "vitest";
import {
  buildGateReport,
  gateItemFromCredits,
  gateItemFromGenerationQuality,
  gateItemFromQc,
  gateItemFromReadiness,
} from "@/lib/release-gate";
import { buildCreditsManifest } from "@/lib/asset-credits";
import type { ReadinessReport } from "@/lib/publish-readiness";
import type { QcReport } from "@/lib/video-composer/qc";

function readiness(overall: ReadinessReport["overall"], items: Array<[string, "pass" | "warn" | "fail"]>, locale = "en"): ReadinessReport {
  const list = items.map(([key, status]) => ({ key: key as never, status, message: `${locale}:${key}` }));
  return {
    items: list,
    pass: list.filter((i) => i.status === "pass").length,
    warn: list.filter((i) => i.status === "warn").length,
    fail: list.filter((i) => i.status === "fail").length,
    overall,
  };
}

function qcReport(status: QcReport["status"]): QcReport {
  const checks: QcReport["checks"] = [
    { id: "video-stream", level: "ok", message: { en: "Video OK" } },
  ];
  if (status !== "ok") {
    checks.push({ id: "black", level: status === "fail" ? "fail" : "warn", message: { en: "Black frames" } });
  }
  return {
    status,
    checks,
    probe: { hasVideo: true, hasAudio: true, width: 1080, height: 1920, duration: 25 },
    signals: { black: [], silence: [], freeze: [], loudness: -14, truePeak: -2 },
  };
}

describe("gateItemFromReadiness", () => {
  it("fails when there is no script to check", () => {
    const item = gateItemFromReadiness(null);
    expect(item.status).toBe("fail");
    expect(item.message.en).toContain("No script");
    expect(item.problems).toEqual([]);
  });

  it("maps needsWork → fail with one problem line per non-passing item", () => {
    const report = readiness("needsWork", [["compliance", "fail"], ["hook", "pass"], ["cta", "warn"]]);
    const item = gateItemFromReadiness(report);
    expect(item.status).toBe("fail");
    // only non-pass items become problems, each carrying both locales
    expect(item.problems).toEqual([
      { en: "en:compliance" },
      { en: "en:cta" },
    ]);
  });

  it("maps risky → warn and ready → pass", () => {
    expect(gateItemFromReadiness(readiness("risky", [["cta", "warn"]])).status).toBe("warn");
    const pass = gateItemFromReadiness(readiness("ready", [["hook", "pass"]]));
    expect(pass.status).toBe("pass");
    expect(pass.problems).toEqual([]);
  });
});

describe("gateItemFromQc", () => {
  it("fails when nothing was composed yet", () => {
    const item = gateItemFromQc(null);
    expect(item.status).toBe("fail");
    expect(item.message.en).toContain("compose");
  });

  it("forwards non-ok check messages as problems", () => {
    const item = gateItemFromQc(qcReport("fail"));
    expect(item.status).toBe("fail");
    expect(item.problems).toEqual([{ en: "Black frames" }]);
  });

  it("maps warn → warn and ok → pass", () => {
    expect(gateItemFromQc(qcReport("warn")).status).toBe("warn");
    expect(gateItemFromQc(qcReport("ok")).status).toBe("pass");
  });
});

describe("gateItemFromGenerationQuality", () => {
  it("passes accepted takes and warns when semantic review is missing or uncertain", () => {
    expect(gateItemFromGenerationQuality([{ shotId: 1, verdict: "accept" }, { shotId: 2, humanDecision: "accepted", verdict: "reject" }]).status).toBe("pass");
    const pending = gateItemFromGenerationQuality([{ shotId: 1 }, { shotId: 2, verdict: "review", overall: 72 }]);
    expect(pending.status).toBe("warn");
    expect(pending.problems).toHaveLength(2);
  });

  it("fails only when a human explicitly rejects the currently selected take", () => {
    const item = gateItemFromGenerationQuality([{ shotId: 3, humanDecision: "rejected", verdict: "accept" }]);
    expect(item.status).toBe("fail");
    expect(item.problems[0].en).toMatch(/rejected by the reviewer/i);
  });
});

describe("gateItemFromCredits", () => {
  it("warns when there are no asset records to verify", () => {
    expect(gateItemFromCredits(null).status).toBe("warn");
  });

  it("warns on review-needed licenses with per-asset problem lines", () => {
    const m = buildCreditsManifest("test", [
      { shotId: 0, type: "stock_footage", license: "cc-by-nc-4.0", filePath: "a.jpg" },
      { shotId: 1, type: "stock_footage", license: "pexels", filePath: "b.mp4" },
    ]);
    const item = gateItemFromCredits(m);
    expect(item.status).toBe("warn");
    expect(item.message.en).toMatch(/review/i);
    expect(item.problems.some((p) => /shot 1\b/i.test(p.en))).toBe(true);
  });

  it("warns on attribution-only manifests and passes clean ones", () => {
    const attr = buildCreditsManifest("t", [{ shotId: 0, type: "stock_footage", license: "cc-by-4.0", author: "A", filePath: "a.jpg" }]);
    const attrItem = gateItemFromCredits(attr);
    expect(attrItem.status).toBe("warn");
    expect(attrItem.message.en).toMatch(/attribution/i);
    const clean = buildCreditsManifest("t", [{ shotId: 0, type: "stock_footage", license: "pexels", filePath: "a.jpg" }]);
    expect(gateItemFromCredits(clean).status).toBe("pass");
  });
});

describe("buildGateReport", () => {
  it("worst status wins and counts are tallied", () => {
    const report = buildGateReport([
      gateItemFromQc(qcReport("ok")),
      gateItemFromCredits(null),
      gateItemFromReadiness(null),
    ]);
    expect(report.status).toBe("fail");
    expect(report.summary).toEqual({ pass: 1, warn: 1, fail: 1 });
    expect(report.verdict.en).toContain("failed");
    expect(report.verdict.en.length).toBeGreaterThan(0);
  });

  it("all pass → pass with a positive verdict", () => {
    const report = buildGateReport([gateItemFromQc(qcReport("ok"))]);
    expect(report.status).toBe("pass");
    expect(report.verdict.en).toContain("passed");
  });

  it("warn without fail → warn", () => {
    const report = buildGateReport([gateItemFromQc(qcReport("ok")), gateItemFromCredits(null)]);
    expect(report.status).toBe("warn");
  });
});
