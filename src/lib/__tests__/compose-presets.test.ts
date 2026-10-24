import { describe, it, expect } from "vitest";
import {
  RENDER_PRESETS,
  DEFAULT_RENDER_PRESET,
  resolveRenderProfile,
  safeEncodeParams,
  isRenderPreset,
  recommendPreset,
} from "@/lib/compose-presets";

describe("resolveRenderProfile (render quality presets)", () => {
  it("fast=720p/veryfast, standard=1080p/medium, HD=1080p/slow", () => {
    expect(resolveRenderProfile("fast")).toEqual({ resolution: "720p", videoPreset: "veryfast", crf: 26 });
    expect(resolveRenderProfile("standard").resolution).toBe("1080p");
    expect(resolveRenderProfile("hd")).toEqual({ resolution: "1080p", videoPreset: "slow", crf: 17 });
  });
  it("invalid/missing presets fall back to the default (standard)", () => {
    expect(resolveRenderProfile("bogus")).toEqual(RENDER_PRESETS[DEFAULT_RENDER_PRESET]);
    expect(resolveRenderProfile(undefined)).toEqual(RENDER_PRESETS.standard);
  });
  it("quality is monotonic: HD crf < standard crf < fast crf (smaller is sharper)", () => {
    expect(RENDER_PRESETS.hd.crf).toBeLessThan(RENDER_PRESETS.standard.crf);
    expect(RENDER_PRESETS.standard.crf).toBeLessThan(RENDER_PRESETS.fast.crf);
  });
});

describe("isRenderPreset (separates valid presets from invalid strings)", () => {
  it("valid presets are true", () => {
    expect(isRenderPreset("fast")).toBe(true);
    expect(isRenderPreset("standard")).toBe(true);
    expect(isRenderPreset("hd")).toBe(true);
  });
  it("invalid strings/empty/non-strings are false (must not override the user's explicit resolution)", () => {
    expect(isRenderPreset("ultra")).toBe(false);
    expect(isRenderPreset("")).toBe(false);
    expect(isRenderPreset(undefined)).toBe(false);
    expect(isRenderPreset(null)).toBe(false);
    expect(isRenderPreset(123)).toBe(false);
  });
});

describe("safeEncodeParams (FFmpeg parameter-injection guard)", () => {
  it("valid x264 presets pass through", () => {
    expect(safeEncodeParams("veryfast", 26)).toEqual({ videoPreset: "veryfast", crf: 26 });
  });
  it("invalid presets fall back to medium", () => {
    expect(safeEncodeParams("evil; rm -rf", 20).videoPreset).toBe("medium");
    expect(safeEncodeParams(undefined, 20).videoPreset).toBe("medium");
  });
  it("crf is clamped to an integer 0-51; invalid falls back to 18", () => {
    expect(safeEncodeParams("medium", 999).crf).toBe(51);
    expect(safeEncodeParams("medium", -5).crf).toBe(0);
    expect(safeEncodeParams("medium", 20.7).crf).toBe(21);
    expect(safeEncodeParams("medium", NaN).crf).toBe(18);
    expect(safeEncodeParams("medium", undefined).crf).toBe(18);
  });
});

describe("recommendPreset (content-adaptive tier)", () => {
  it("short and simple → fast", () => {
    expect(recommendPreset({ shotCount: 2, totalDuration: 12 }).preset).toBe("fast");
  });
  it("long video/many shots/many i2v → hd", () => {
    expect(recommendPreset({ shotCount: 3, totalDuration: 45 }).preset).toBe("hd"); // long duration
    expect(recommendPreset({ shotCount: 7, totalDuration: 20 }).preset).toBe("hd"); // many shots
    expect(recommendPreset({ shotCount: 3, totalDuration: 20, i2vCount: 3 }).preset).toBe("hd"); // many i2v
  });
  it("regular → standard", () => {
    expect(recommendPreset({ shotCount: 4, totalDuration: 25 }).preset).toBe("standard");
  });
  it("any i2v means not 'simple', never drops to fast", () => {
    expect(recommendPreset({ shotCount: 2, totalDuration: 12, i2vCount: 1 }).preset).toBe("standard");
  });
  it("includes a readable reason", () => {
    expect(recommendPreset({ shotCount: 2, totalDuration: 12 }).reason).toBeTruthy();
  });
});
