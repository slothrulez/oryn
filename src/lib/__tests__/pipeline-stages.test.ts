import { describe, it, expect } from "vitest";
import { PIPELINE_STAGES, isPipelineStage, stagesFrom, STAGE_LABEL_KEYS } from "../pipeline-stages";

describe("pipeline stages (server-side fully managed chain stage model)", () => {
  it("stage order is fixed: judges → visuals → compose", () => {
    expect(PIPELINE_STAGES).toEqual(["judge", "ai_scenes", "stock_fill", "compose"]);
  });

  it("stagesFrom slices from the checkpoint: completed stages are not rerun", () => {
    expect(stagesFrom("judge")).toEqual(["judge", "ai_scenes", "stock_fill", "compose"]);
    expect(stagesFrom("ai_scenes")).toEqual(["ai_scenes", "stock_fill", "compose"]);
    expect(stagesFrom("stock_fill")).toEqual(["stock_fill", "compose"]);
    expect(stagesFrom("compose")).toEqual(["compose"]);
  });

  it("an unknown checkpoint falls back to the whole chain: better to run extra (stages are re-entrant) than to skip", () => {
    expect(stagesFrom(undefined)).toEqual(["judge", "ai_scenes", "stock_fill", "compose"]);
    expect(stagesFrom("bogus")).toEqual(["judge", "ai_scenes", "stock_fill", "compose"]);
    expect(stagesFrom(42)).toEqual(["judge", "ai_scenes", "stock_fill", "compose"]);
  });

  it("isPipelineStage accepts only valid stage names", () => {
    expect(isPipelineStage("judge")).toBe(true);
    expect(isPipelineStage("done")).toBe(false);
    expect(isPipelineStage(null)).toBe(false);
  });

  it("every stage has a progress copy key (script namespace)", () => {
    for (const s of PIPELINE_STAGES) {
      expect(STAGE_LABEL_KEYS[s]).toBeTruthy();
    }
  });
});
