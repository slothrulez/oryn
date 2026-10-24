import { describe, expect, it } from "vitest";
import { getVideoModelCapabilities, preflightVideoGeneration } from "@/lib/model-capabilities";

describe("video model capabilities", () => {
  it("normalizes a schema-backed image-to-video model", () => {
    const caps = getVideoModelCapabilities("google/veo3.1/image-to-video");
    expect(caps).toMatchObject({
      confidence: "known",
      textToVideo: false,
      imageToVideo: true,
      referenceImages: false,
      referenceVideo: false,
      referenceAudio: false,
      lastFrame: true,
      nativeAudio: true,
      durationValues: [4, 6, 8],
    });
  });


  it("does not invent a reference sibling for the fast-only family", () => {
    const caps = getVideoModelCapabilities("acme/motion-2.0-fast/image-to-video", false, "atlas-cloud");
    expect(caps.referenceImages).toBe(false);
    expect(caps.referenceVideo).toBe(false);
  });

  it("keeps unknown custom models permissive", () => {
    const result = preflightVideoGeneration({
      modelId: "my-company/video-v9",
      duration: 5,
      resolution: "1080p",
      aspectRatio: "9:16",
      chainMode: "pin",
    });
    expect(result.capabilities.confidence).toBe("unknown");
    expect(result.capabilities.lastFrame).toBeNull();
    expect(result.adjustments).toEqual([]);
    expect(result.warnings).toEqual(["capabilities-unknown"]);
  });

  it("keeps provider-hosted custom models permissive when their mode is undeclared", () => {
    const result = preflightVideoGeneration({
      modelId: "my-company/video-v9",
      provider: "atlas-cloud",
      resolution: "1080p",
      aspectRatio: "9:16",
      chainMode: "off",
      referenceImageCount: 2,
    });
    expect(result.capabilities.referenceImages).toBeNull();
    expect(result.warnings).toEqual(["capabilities-unknown"]);
  });



  it("warns before dropping unsupported reference conditioning", () => {
    const result = preflightVideoGeneration({
      modelId: "google/veo3.1/image-to-video",
      provider: "atlas-cloud",
      resolution: "1080p",
      aspectRatio: "9:16",
      chainMode: "off",
      referenceImageCount: 2,
      referenceAudioCount: 1,
    });
    expect(result.warnings).toEqual(expect.arrayContaining([
      "reference-conditioning-unavailable",
      "reference-audio-unavailable",
    ]));
  });
});
