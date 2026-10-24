import { describe, it, expect } from "vitest";
import { isAudibleFromVolumedetect } from "@/lib/video-composer/audio-probe";

describe("isAudibleFromVolumedetect", () => {
  const wrap = (line: string) =>
    `[Parsed_volumedetect_0 @ 0x55] n_samples: 441000\n[Parsed_volumedetect_0 @ 0x55] mean_volume: -20.0 dB\n[Parsed_volumedetect_0 @ 0x55] ${line}\n`;

  it("has sound (max_volume above the threshold) → audible", () => {
    expect(isAudibleFromVolumedetect(wrap("max_volume: -3.0 dB"))).toBe(true);
    expect(isAudibleFromVolumedetect(wrap("max_volume: 0.0 dB"))).toBe(true);
  });

  it("silent track (very low max_volume) → not audible (lets TTS take over)", () => {
    expect(isAudibleFromVolumedetect(wrap("max_volume: -91.0 dB"))).toBe(false);
    expect(isAudibleFromVolumedetect(wrap("max_volume: -70.5 dB"))).toBe(false);
  });

  it("pure digital silence -inf → not audible", () => {
    expect(isAudibleFromVolumedetect(wrap("max_volume: -inf dB"))).toBe(false);
  });

  it("threshold boundary: -50dB is not audible, -49dB is", () => {
    expect(isAudibleFromVolumedetect(wrap("max_volume: -50.0 dB"))).toBe(false);
    expect(isAudibleFromVolumedetect(wrap("max_volume: -49.0 dB"))).toBe(true);
  });

  it("max_volume cannot be parsed → conservatively assume sound (never swallow the model's own speech)", () => {
    expect(isAudibleFromVolumedetect("")).toBe(true);
    expect(isAudibleFromVolumedetect("some unrelated ffmpeg output")).toBe(true);
  });

  it("custom threshold", () => {
    expect(isAudibleFromVolumedetect(wrap("max_volume: -55.0 dB"), -60)).toBe(true);
  });
});
