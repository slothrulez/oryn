import { describe, it, expect } from "vitest";
import {
  buildJudgePrompt,
  parseJudgeResponse,
  autoApplicableRewrites,
  autoApplicableDescriptionRewrites,
  factTokens,
  preservesFactTokens,
  JUDGE_IDS,
} from "@/lib/script-judge";

const SHOTS = [
  { shotId: 1, voiceover: "I've rebought these tissues ten times, try them and you'll get it", description: "woman holds up the tissues and talks to the camera" },
  { shotId: 2, voiceover: "They're twice as thick as anything at this price, one sheet beats three", description: "show the product's high quality" },
  { shotId: 3, voiceover: "Tap the link below to grab them now" },
];

describe("buildJudgePrompt (judge panel phase 2)", () => {
  it("all five judges present + spoken rule injected + length limit + compliance red line + evidence rule + tier criteria", () => {
    const p = buildJudgePrompt(SHOTS, { styleLabel: "Creator talking head" });
    expect(p).toContain("Pace judge");
    expect(p).toContain("Voice judge");
    expect(p).toContain("Idea judge");
    expect(p).toContain("Structure judge");
    expect(p).toContain("Visual judge");
    expect(p).toContain("spoken");
    expect(p).toContain("±20%");
    expect(p).toContain("never add any efficacy/price promise");
    expect(p).toContain("without a quote are invalid");
    expect(p).toContain("invariant");
    expect(p).toContain("Even information density");
    expect(p).toContain("fake hook substitutes");
    expect(p).toContain("Purpose statements are not visuals");
    expect(p).toContain('line "I\'ve rebought these tissues ten times');
    expect(p).toContain('visual "woman holds up the tissues and talks to the camera"');
    expect(p).toContain('shotId 3: "Tap the link below to grab them now"');
    expect(p).toContain("in English");
  });

  it("style-specific criteria inject by styleType: reversal formula / drama action verbs / interview swap test", () => {
    expect(buildJudgePrompt(SHOTS, { styleType: "reversal" })).toContain("one-sentence formula");
    expect(buildJudgePrompt(SHOTS, { styleType: "drama" })).toContain("action verb");
    expect(buildJudgePrompt(SHOTS, { styleType: "drama" })).toContain("Swap-speaker test");
    expect(buildJudgePrompt(SHOTS, { styleType: "interview" })).toContain("Swap-speaker test");
    expect(buildJudgePrompt(SHOTS, { styleType: "pain_point" })).not.toContain("Swap-speaker test");
  });

  it("always instructs English output", () => {
    const p = buildJudgePrompt([{ shotId: 1, voiceover: "I bought this ten times." }]);
    expect(p).toContain("in English");
  });
});

describe("parseJudgeResponse (phase 2: five judges/tier clamping/fact-token checks/visual rewrites)", () => {
  it("normal parse: clamps the judge enum, fills missing judges, accepts rewrites only for real shots, invalid tiers clamp to taste", () => {
    const content = JSON.stringify({
      verdicts: [
        { judge: "pace", issues: [{ shotId: 1, issue: "first line does not hook", tier: "invariant" }, { shotId: 99, issue: "ghost shot" }] },
        { judge: "hallucinated", issues: [{ issue: "nonexistent judge" }] },
      ],
      rewrites: [
        { shotId: 3, voiceover: "Anyway, link's right below, see for yourself", tier: "default" },
        { shotId: 99, voiceover: "ghost rewrite" },
        { shotId: 3, voiceover: "duplicate shotId should be deduped", tier: "default" },
      ],
      summary: "Overall it sounds too much like an ad",
    });
    const r = parseJudgeResponse(content, SHOTS);
    expect(r.verdicts.map((v) => v.judge)).toEqual([...JUDGE_IDS]);
    const pace = r.verdicts.find((v) => v.judge === "pace")!;
    expect(pace.issues.length).toBe(2);
    expect(pace.issues[0]).toEqual({ shotId: 1, issue: "first line does not hook", tier: "invariant" });
    expect(pace.issues[1].shotId).toBeUndefined();
    expect(pace.issues[1].tier).toBe("taste");
    expect(r.verdicts.find((v) => v.judge === "voice")!.issues).toEqual([]);
    expect(r.rewrites).toEqual([{ shotId: 3, voiceover: "Anyway, link's right below, see for yourself", tier: "default" }]);
    expect(r.summary).toBe("Overall it sounds too much like an ad");
  });

  it("length-ratio clamp: rewrites outside 0.4x–2.5x are dropped (keeps TTS duration and prevents content distortion)", () => {
    const content = JSON.stringify({
      verdicts: [],
      rewrites: [
        { shotId: 1, voiceover: "Hi", tier: "default" },
        { shotId: 2, voiceover: "It" + " works really well".repeat(30), tier: "default" },
      ],
    });
    expect(parseJudgeResponse(content, SHOTS).rewrites).toEqual([]);
  });

  it("fact-token check: a rewrite that drops a number is discarded; boundary guard (3 does not match 13)", () => {
    const shots = [{ shotId: 1, voiceover: "Only $9.9 for a 12-roll pack" }];
    const keep = JSON.stringify({ verdicts: [], rewrites: [{ shotId: 1, voiceover: "$9.9 gets you 12 rolls, honestly", tier: "default" }] });
    expect(parseJudgeResponse(keep, shots).rewrites.length).toBe(1);
    const lost = JSON.stringify({ verdicts: [], rewrites: [{ shotId: 1, voiceover: "nine ninety gets you twelve rolls, honestly", tier: "default" }] });
    expect(parseJudgeResponse(lost, shots).rewrites).toEqual([]);
    expect(preservesFactTokens("results in 3s", "results in 13s")).toBe(false);
    expect(factTokens("$9.9 12 rolls $9.9")).toEqual(["9.9", "12"]);
  });

  it("visual rewrites: only shots with a description, with the same length clamp", () => {
    const content = JSON.stringify({
      verdicts: [],
      rewrites: [],
      descriptionRewrites: [
        { shotId: 2, description: "woman stacks two tissues and lifts a kettle of water without tearing them", tier: "invariant" },
        { shotId: 3, description: "shots without a description are not accepted" },
        { shotId: 2, description: "duplicate deduped" },
      ],
    });
    const r = parseJudgeResponse(content, SHOTS);
    expect(r.descriptionRewrites).toEqual([
      { shotId: 2, description: "woman stacks two tissues and lifts a kettle of water without tearing them", tier: "invariant" },
    ]);
  });

  it("markdown-wrapped JSON parses; thoroughly invalid JSON throws a readable error", () => {
    const wrapped = "```json\n" + JSON.stringify({ verdicts: [], rewrites: [] }) + "\n```";
    expect(parseJudgeResponse(wrapped, SHOTS).verdicts.length).toBe(5);
    expect(() => parseJudgeResponse("this is not JSON", SHOTS)).toThrow("did not return valid JSON");
  });
});

describe("autoApplicableRewrites (adoption tiers: the managed chain only auto-applies invariant/default)", () => {
  it("taste tier is filtered, invariant/default kept (same rule for line and visual rewrites)", () => {
    const report = parseJudgeResponse(
      JSON.stringify({
        verdicts: [],
        rewrites: [
          { shotId: 1, voiceover: "I've honestly rebought these tissues ten times, try them, you'll see", tier: "default" },
          { shotId: 3, voiceover: "Link's below, grab it if you want", tier: "taste" },
        ],
        descriptionRewrites: [
          { shotId: 2, description: "woman soaks the tissue in water and lifts it out, still intact", tier: "taste" },
        ],
      }),
      SHOTS
    );
    expect(autoApplicableRewrites(report).map((r) => r.shotId)).toEqual([1]);
    expect(autoApplicableDescriptionRewrites(report)).toEqual([]);
    expect(report.rewrites.length).toBe(2);
    expect(report.descriptionRewrites.length).toBe(1);
  });
});
