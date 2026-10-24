import { describe, expect, it } from "vitest";
import { parseMediaAnalysis } from "@/lib/media-analysis";

describe("parseMediaAnalysis", () => {
  it("parses fenced JSON and clamps arrays/text", () => {
    const raw = `\`\`\`json
    {"summary":"  portrait product close-up  ","subjects":["cup",7,"tabletop"],"visualStyle":{"lighting":"side backlight","palette":"warm brown","composition":"centered","camera":"close shot"},"motion":{"pacing":"fast","cameraMoves":["push-in","orbit"],"sceneRhythm":"three-part"},"reusablePrompt":"commercial product film","negativePrompt":"warped","suggestedUses":["main product image","short video opening"]}
    \`\`\``;
    const result = parseMediaAnalysis(raw, "video");
    expect(result.summary).toBe("portrait product close-up");
    expect(result.subjects).toEqual(["cup", "tabletop"]);
    expect(result.motion?.cameraMoves).toEqual(["push-in", "orbit"]);
    expect(result.suggestedUses).toHaveLength(2);
  });

  it("returns a stable empty shape when optional fields drift", () => {
    const result = parseMediaAnalysis('{"summary":"test"}', "image");
    expect(result).toEqual({
      mediaType: "image",
      summary: "test",
      subjects: [],
      visualStyle: { lighting: "", palette: "", composition: "", camera: "" },
      reusablePrompt: "",
      negativePrompt: "",
      suggestedUses: [],
    });
  });
});
