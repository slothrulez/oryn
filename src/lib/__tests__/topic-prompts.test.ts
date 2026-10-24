import { describe, it, expect } from "vitest";
import { buildTopicPrompt, buildTopicBatchPrompt } from "@/lib/script-engine/prompts";

describe("buildTopicPrompt (one-line topic video, no product)", () => {
  it("includes the user's topic verbatim", () => {
    const p = buildTopicPrompt({ topic: "how to brew pour-over coffee at home" });
    expect(p).toContain("how to brew pour-over coffee at home");
  });

  it("requires English searchTerms on every shot (key to automatic footage matching)", () => {
    const p = buildTopicPrompt({ topic: "city skyline at night" });
    expect(p).toContain("searchTerms");
    expect(p).toContain("[required]");
  });

  it("always appends the English language directive", () => {
    const p = buildTopicPrompt({ topic: "how to brew pour-over coffee at home" });
    expect(p).toContain("LANGUAGE");
    expect(p).toContain("natural English");
  });

  it("frames around the topic, not a product (no commerce input block)", () => {
    const p = buildTopicPrompt({ topic: "small things to do on a rainy day" });
    expect(p).toContain("[Topic]");
    expect(p).not.toContain("[Product info]");
    expect(p).not.toContain("Product name:");
  });

  it("injects the matching narration-style directive (knowledge = Explainer)", () => {
    const p = buildTopicPrompt({ topic: "what is a black hole", narrationStyle: "knowledge" });
    expect(p).toContain("Explainer");
  });

  it("story style injects the story directive", () => {
    const p = buildTopicPrompt({ topic: "childhood summers", narrationStyle: "story" });
    expect(p).toContain("Emotional story");
  });

  it("defaults to Explainer when no style is given", () => {
    const p = buildTopicPrompt({ topic: "any topic" });
    expect(p).toContain("Explainer");
  });

  it("respects the target duration", () => {
    const p = buildTopicPrompt({ topic: "topic", targetDuration: 40 });
    expect(p).toContain("40 seconds");
  });

  it("visualSource is fixed to ai_generate (no product_image)", () => {
    const p = buildTopicPrompt({ topic: "topic" });
    expect(p).toContain('"ai_generate"');
    expect(p).not.toContain("product_image");
  });

  it("output is English only", () => {
    expect(buildTopicPrompt({ topic: "why auroras appear" })).not.toMatch(/[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/);
  });
});

describe("buildTopicBatchPrompt (multiple options)", () => {
  it("asks for the requested number of script options", () => {
    const p = buildTopicBatchPrompt({ topic: "pour-over coffee" }, 3);
    expect(p).toContain("Generate 3 script options");
    expect(p).toContain('"scripts"');
  });

  it("batch prompt still requires searchTerms on every shot", () => {
    const p = buildTopicBatchPrompt({ topic: "pour-over coffee" }, 2);
    expect(p).toContain("Generate 2 script options");
    expect(p).toContain("searchTerms");
  });

  it("base prompt still contains the topic verbatim", () => {
    const p = buildTopicBatchPrompt({ topic: "why auroras appear" }, 3);
    expect(p).toContain("why auroras appear");
  });
});
