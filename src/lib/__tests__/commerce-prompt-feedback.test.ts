import { describe, it, expect } from "vitest";
import { buildUserPrompt, buildBatchPrompt } from "@/lib/script-engine/prompts";

// Data flywheel (write side): the commerce prompt must carry the pre-rendered performance hint
// through to the LLM so newly generated scripts lean toward what historically converts.
describe("buildUserPrompt × performanceHint (data flywheel feedback injection)", () => {
  const base = { productName: "CloudSoft Tissues", category: "home" as const, styleType: "pain_point" as const };

  it("a provided performanceHint is injected verbatim into the prompt (before the hook guidance)", () => {
    const hint = "[HISTORICAL CONVERSION FEEDBACK (real results from your published videos — use it)]\n- Top converting script style: \"Comparison review\"";
    const p = buildUserPrompt({ ...base, performanceHint: hint });
    expect(p).toContain("HISTORICAL CONVERSION FEEDBACK");
    expect(p).toContain("Comparison review");
    // must appear before the golden-3-second hook guidance block (so it can bias hook choice)
    expect(p.indexOf("HISTORICAL CONVERSION FEEDBACK")).toBeLessThan(p.indexOf("Golden 3-second hook"));
  });

  it("no performanceHint (cold start) → no feedback section", () => {
    const p = buildUserPrompt(base);
    expect(p).not.toContain("HISTORICAL CONVERSION FEEDBACK");
  });

  it("an empty performanceHint counts as no data and is not injected", () => {
    const p = buildUserPrompt({ ...base, performanceHint: "" });
    expect(p).not.toContain("HISTORICAL CONVERSION FEEDBACK");
  });

  it("batch prompts carry the feedback too (buildBatchPrompt builds on buildUserPrompt)", () => {
    const hint = "[HISTORICAL CONVERSION FEEDBACK (real results from your published videos — use it)]\n- The highest-converting opening hook is \"Visual shock\"";
    const p = buildBatchPrompt({ ...base, performanceHint: hint }, 3);
    expect(p).toContain("HISTORICAL CONVERSION FEEDBACK");
    expect(p).toContain("Visual shock");
  });
});
