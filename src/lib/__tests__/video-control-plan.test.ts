import { describe, expect, it } from "vitest";
import { sanitizeVideoControlSummary } from "@/lib/video-control-plan";

describe("video control plan", () => {



  it("sanitizes persisted summaries and drops unknown fields", () => {
    expect(sanitizeVideoControlSummary({
      version: 1,
      strategy: "reference-pack",
      mode: "video-to-video",
      referenceRoles: ["keyframe", "character", "not-a-role"],
      referenceCount: 999,
      audioMode: "native",
      voiceoverBound: true,
      warnings: ["reference-pack-unsupported", "unknown"],
      promptSuffix: "must not persist",
    })).toEqual({
      version: 1,
      strategy: "reference-pack",
      mode: "video-to-video",
      referenceRoles: ["keyframe", "character"],
      referenceCount: 32,
      audioMode: "native",
      voiceoverBound: true,
      warnings: ["reference-pack-unsupported"],
    });
  });
});
