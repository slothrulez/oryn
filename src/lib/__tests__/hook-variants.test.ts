import { describe, it, expect } from "vitest";
import { buildHookVariants } from "@/lib/script-engine/hook-variants";
import type { Shot } from "@/lib/db/schema";

const mk = (o: Partial<Shot>): Shot => ({
  shotId: 1,
  type: "demo",
  duration: 4,
  description: "",
  camera: "",
  visualSource: "ai_generate",
  transition: "direct_concat",
  voiceover: "",
  ...o,
});

const base = {
  styleType: "pain_point",
  totalDuration: 20,
  shots: [
    mk({ shotId: 1, type: "hook", voiceover: "original hook copy", description: "original visual" }),
    mk({ shotId: 2, type: "demo", voiceover: "demo" }),
    mk({ shotId: 3, type: "cta", voiceover: "order" }),
  ],
};

describe("buildHookVariants", () => {
  it("generates N variants, each with a hookId, distinct mechanisms, and only shot 1 differs", () => {
    const vs = buildHookVariants(base, "beauty", 3);
    expect(vs.length).toBe(3);
    expect(new Set(vs.map((v) => v.hookId)).size).toBe(3); // no duplicate mechanisms
    for (const v of vs) {
      expect(v.hookId).toBeTruthy();
      expect(v.script.shots.length).toBe(3);
      expect(v.script.shots[0].type).toBe("hook");
      expect(v.script.shots[0].voiceover).not.toBe("original hook copy"); // shot 1 voiceover was replaced
      expect(v.script.shots[1].voiceover).toBe("demo"); // remaining shots unchanged
      expect(v.script.shots[2].voiceover).toBe("order");
    }
  });

  it("shot 1's visual description keeps the original intent", () => {
    const vs = buildHookVariants(base, "beauty", 1);
    expect(vs[0].script.shots[0].description).toContain("original visual");
  });

  it("does not mutate the original script (base.shots[0] is untouched)", () => {
    buildHookVariants(base, "beauty", 2);
    expect(base.shots[0].voiceover).toBe("original hook copy");
  });

  it("empty shots → empty array", () => {
    expect(buildHookVariants({ shots: [] }, "beauty")).toEqual([]);
  });
});
