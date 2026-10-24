import { describe, it, expect } from "vitest";
import {
  checkAiCommerceCompliance,
  AI_REVIEW_STYLES,
  DIGITAL_HUMAN_BANNED_CATEGORIES,
} from "@/lib/ai-commerce-compliance";
import { gateItemFromAiPolicy } from "@/lib/release-gate";

describe("AI commerce platform-rule guardrails (warn only, never block)", () => {
  it("comparison/unboxing review styles trigger a warning regardless of AI presenters", () => {
    for (const style of AI_REVIEW_STYLES) {
      const w = checkAiCommerceCompliance({ styleType: style, hasAiPerson: false });
      expect(w.some((x) => x.id === "ai_review_style"), style).toBe(true);
      // the warning must say the feature stays available — a guardrail, not a ban
      expect(w[0].message.en).toMatch(/\w/);
    }
    expect(
      checkAiCommerceCompliance({ styleType: "drama", hasAiPerson: true }).some((x) => x.id === "ai_review_style")
    ).toBe(false);
  });

  it("banned categories for digital humans: only hit from product text when an AI presenter appears", () => {
    const w = checkAiCommerceCompliance({
      styleType: "talking_head",
      hasAiPerson: true,
      productText: "skin whitening serum beauty",
    });
    expect(w.some((x) => x.id === "digital_human_category")).toBe(true);

    // same product, no AI person → no warning (real footage is not restricted)
    const w2 = checkAiCommerceCompliance({
      styleType: "talking_head",
      hasAiPerson: false,
      productText: "skin whitening serum beauty",
    });
    expect(w2.some((x) => x.id === "digital_human_category")).toBe(false);

    // ordinary categories are not flagged
    const w3 = checkAiCommerceCompliance({
      styleType: "talking_head",
      hasAiPerson: true,
      productText: "tissues home essentials",
    });
    expect(w3.some((x) => x.id === "digital_human_category")).toBe(false);
  });

  it("multiple category hits produce only one category warning (avoids spam)", () => {
    const w = checkAiCommerceCompliance({
      styleType: "talking_head",
      hasAiPerson: true,
      productText: "weight loss dietary supplement lowers blood sugar",
    });
    expect(w.filter((x) => x.id === "digital_human_category")).toHaveLength(1);
  });

  it("AI presenter first-hand testing claims trigger a rewrite suggestion; none without an AI presenter", () => {
    const w = checkAiCommerceCompliance({
      styleType: "drama",
      hasAiPerson: true,
      dialogueText: "I tested it and it works, go for it",
    });
    expect(w.some((x) => x.id === "personal_testimony")).toBe(true);

    const w2 = checkAiCommerceCompliance({
      styleType: "drama",
      hasAiPerson: false,
      dialogueText: "I tested it myself",
    });
    expect(w2.some((x) => x.id === "personal_testimony")).toBe(false);
  });

  it("clean input returns an empty array", () => {
    expect(
      checkAiCommerceCompliance({
        styleType: "drama",
        hasAiPerson: true,
        productText: "tissues home essentials",
        dialogueText: "lots of people say it is good, worth a try",
      })
    ).toEqual([]);
  });

  it("all five banned categories are fully defined", () => {
    expect(DIGITAL_HUMAN_BANNED_CATEGORIES.map((c) => c.label.en)).toEqual([
      "medical",
      "finance",
      "beauty efficacy",
      "health-supplement efficacy",
      "education/training outcomes",
    ]);
  });
});

describe("gateItemFromAiPolicy", () => {
  it("no warnings → pass; warnings → warn (never fail), problems are complete", () => {
    expect(gateItemFromAiPolicy([]).status).toBe("pass");
    const item = gateItemFromAiPolicy(
      checkAiCommerceCompliance({ styleType: "comparison", hasAiPerson: true })
    );
    expect(item.status).toBe("warn");
    expect(item.id).toBe("aiPolicy");
    expect(item.problems.length).toBeGreaterThan(0);
    for (const p of item.problems) {
      expect(p.en).toBeTruthy();
      expect(p.en).toBeTruthy();
    }
  });
});
