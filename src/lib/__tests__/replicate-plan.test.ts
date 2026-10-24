import { describe, it, expect } from "vitest";
import {
  shotPlanFromCuts,
  replicateReferenceStructure,
  buildReplicatePrompt,
  referenceModelFor,
  REPLICATE_MAX_REF_SEC,
} from "@/lib/replicate-plan";

describe("shotPlanFromCuts rhythm skeleton", () => {
  it("cut points produce the right segments with 0.1s precision", () => {
    const shots = shotPlanFromCuts([3.2, 5.3, 9.0], 12);
    expect(shots.map((s) => s.duration)).toEqual([3.2, 2.1, 3.7, 3]);
    expect(shots.map((s) => s.index)).toEqual([1, 2, 3, 4]);
    expect(shots[2].start).toBeCloseTo(5.3);
  });

  it("fragments under 1s merge into the previous shot; a leading fragment merges into the next", () => {
    expect(shotPlanFromCuts([3, 3.4, 8], 10).map((s) => s.duration)).toEqual([3.4, 4.6, 2]);
    expect(shotPlanFromCuts([0.5, 4], 10).map((s) => s.duration)).toEqual([4, 6]);
  });

  it("no cuts → one whole-video shot; invalid duration → empty", () => {
    expect(shotPlanFromCuts([], 8)).toEqual([{ index: 1, start: 0, duration: 8 }]);
    expect(shotPlanFromCuts([1, 2], 0)).toEqual([]);
    expect(shotPlanFromCuts([1, 2], NaN)).toEqual([]);
  });

  it("out-of-range/duplicate cut points are cleaned", () => {
    const shots = shotPlanFromCuts([-1, 0, 5, 5, 20], 10);
    expect(shots.map((s) => s.duration)).toEqual([5, 5]);
  });

  it("shot counts over the cap merge into 12 shots or fewer with the total duration preserved", () => {
    const cuts = Array.from({ length: 29 }, (_, i) => (i + 1) * 2);
    const shots = shotPlanFromCuts(cuts, 60);
    expect(shots.length).toBeLessThanOrEqual(12);
    const total = shots.reduce((s, x) => s + x.duration, 0);
    expect(total).toBeCloseTo(60, 0);
  });
});

describe("replicateReferenceStructure injection block", () => {
  it("includes the shot count, per-shot durations and the 'replicate rhythm only' constraint", () => {
    const shots = shotPlanFromCuts([3, 7], 10);
    const block = replicateReferenceStructure(shots, 10);
    expect(block).toContain("3 shots");
    expect(block).toContain("shot 1 3s");
    expect(block).toContain("Do not copy the reference content");
  });

  it("an empty skeleton returns an empty string", () => {
    expect(replicateReferenceStructure([], 10)).toBe("");
  });
});

describe("buildReplicatePrompt model-level prompt", () => {
  it("references video 1 and image 1 with the product-fidelity constraint and no-voice directive", () => {
    const p = buildReplicatePrompt({ productName: "CloudSoft Tissues", sellingPoints: "extra-thick, tear-proof", imageCount: 3 });
    expect(p).toContain("video 1");
    expect(p).toContain("image 1-3");
    expect(p).toContain("CloudSoft Tissues");
    expect(p).toContain("match the reference images exactly");
    expect(p).toContain("No spoken voice");
    expect(p).toContain("extra-thick, tear-proof");
  });

  it("no product images → no image ordinals referenced", () => {
    const p = buildReplicatePrompt({ productName: "Tissues", imageCount: 0 });
    expect(p).not.toContain("image 1");
    expect(p).toContain("Tissues");
  });
});

describe("referenceModelFor model mapping", () => {


  it("families without a reference variant → undefined (the UI disables the button)", () => {
    expect(referenceModelFor("reelai/reel-v3.0-pro/image-to-video")).toBeUndefined();
    expect(referenceModelFor("acme/motion-v1.5-pro/image-to-video")).toBeUndefined();
    expect(referenceModelFor("nova/nova-2.3/i2v-standard")).toBeUndefined();
    expect(referenceModelFor(undefined)).toBeUndefined();
  });

  it("the reference duration cap constant is 15s (Motion protocol)", () => {
    expect(REPLICATE_MAX_REF_SEC).toBe(15);
  });
});
