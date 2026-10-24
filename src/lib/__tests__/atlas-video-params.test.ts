import { describe, it, expect } from "vitest";
import {
  specFromOpenApiInput,
  pickEnumDuration,
  pickResolution,
  pickRatio,
} from "@/lib/providers/atlas-video-params";
import type { VideoOptions } from "@/lib/providers/types";

describe("value pickers", () => {
  it("pickEnumDuration: rounds to the nearest tier, ties go shorter (cheaper)", () => {
    expect(pickEnumDuration([4, 5, 6, 7, 8], 3)).toBe(4);
    expect(pickEnumDuration([6, 10], 7)).toBe(6);
    expect(pickEnumDuration([6, 10], 8)).toBe(6); // tie -> shorter
    expect(pickEnumDuration([8, 4, 6], 5)).toBe(4); // tie -> shorter, order-insensitive
    expect(pickEnumDuration([-1, 4, 5], 2)).toBe(4); // -1 auto sentinel filtered out
  });

  it("pickResolution: suffixed k shorthands like 4k-esr parse (the old implementation dropped the whole tier)", () => {
    expect(pickResolution(["1080p", "4k-esr"], 2160, 3840)).toBe("4k-esr");
    expect(pickResolution(["2K", "4k-esr"], 1440, 2560)).toBe("2K");
  });

  it("pickResolution: smallest tier covering the requested short side; if none covers, the largest; bare names win within a tier", () => {
    expect(pickResolution(["768P", "2K"], 1080, 1920)).toBe("2K");
    expect(pickResolution(["768P", "2K"], 720, 1280)).toBe("768P");
    expect(pickResolution(["720p", "1080p", "4k"], 1080, 1920)).toBe("1080p");
    expect(pickResolution(["480p", "720p", "720p-SR", "1080p-SR", "1440p-SR"], 1080, 1920)).toBe("1080p-SR");
    expect(pickResolution(["720P", "1080P"], 1440, 2560)).toBe("1080P"); // nothing covers 1440 -> largest
    expect(pickResolution(["720p-SR", "720p"], 720, 1280)).toBe("720p"); // plain over suffixed
    // issue #28: the curated Motion 2.5 enum omitted native 1080p, so a 1080p request landed
    // on 1080p-sr — a separately priced upscale product, ~5x the native per-second rate.
    expect(
      pickResolution(["480p", "720p", "720p-sr", "1080p", "1080p-sr", "1080p-esr", "1440p-sr", "4k-esr"], 1080, 1920)
    ).toBe("1080p");
  });

  it("pickRatio: nearest numeric ratio; adaptive only when that is all there is; with known sizes numeric beats adaptive", () => {
    expect(pickRatio(["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"], 1080, 1920)).toBe("9:16");
    expect(pickRatio(["adaptive"], 1080, 1920)).toBe("adaptive");
    expect(pickRatio(["adaptive", "16:9", "9:16"], 1080, 1920)).toBe("9:16");
    expect(pickRatio(["16:9", "9:16"], 1920, 1080)).toBe("16:9");
  });
});




describe("specFromOpenApiInput: dynamic model schema derivation (submit side of dynamic imports)", () => {

  it("recognizes the sound audio key, filters the -1 duration sentinel, detects seed/watermark", () => {
    const spec = specFromOpenApiInput({
      properties: {
        prompt: { type: "string" },
        image: { type: "string" },
        duration: { type: "integer", enum: [-1, 4, 5], default: 5 },
        sound: { type: "boolean", default: true },
        seed: { type: "integer" },
        watermark: { type: "boolean" },
      },
    })!;
    expect(spec.durationEnum).toEqual([4, 5]);
    expect(spec.audioKey).toBe("sound");
    expect(spec.supportsSeed).toBe(true);
    expect(spec.supportsWatermark).toBe(true);
  });

  it("non-schema input returns undefined (falls back to the old request body)", () => {
    expect(specFromOpenApiInput(undefined)).toBeUndefined();
    expect(specFromOpenApiInput({})).toBeUndefined();
    expect(specFromOpenApiInput("nope")).toBeUndefined();
  });
});
