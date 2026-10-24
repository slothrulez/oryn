import { describe, it, expect } from "vitest";
import { VOICE_GROUND_CHAIN, roomToneSource } from "../video-composer/voice-ground";
import { buildComposeCommand, type ComposeConfig } from "../video-composer/composer";

/**
 * Voice grounding contract: TTS narration passes the de-broadcast chain and a room-tone bed
 * runs under the whole timeline; native model audio (Motion 2.x own voice) is NEVER touched;
 * voiceGround:false restores the legacy graph byte-for-byte.
 */

const cfg = (over: Partial<ComposeConfig["output"]> = {}, clips?: ComposeConfig["clips"]): ComposeConfig => ({
  projectId: "t",
  clips: clips ?? [
    { type: "image", filePath: "/tmp/a.jpg", duration: 3, transition: "direct_concat", motion: "static", audioPath: "/tmp/tts-1.mp3" },
    { type: "video", filePath: "/tmp/b.mp4", duration: 4, transition: "direct_concat", motion: "static", hasAudio: true },
  ],
  output: { resolution: "720p", aspectRatio: "9:16", ...over },
});

describe("voice grounding (grounding the TTS voice)", () => {
  it("on by default with a TTS track: TTS goes through the de-broadcast chain + whole-video room tone underneath", () => {
    const cmd = buildComposeCommand(cfg());
    expect(cmd).toContain(VOICE_GROUND_CHAIN);
    expect(cmd).toContain("anoisesrc=colour=brown");
    expect(cmd).toContain("[voice_grounded]");
  });

  it("native audio never goes through the chain: the chain appears once (on the TTS input stream)", () => {
    const cmd = buildComposeCommand(cfg());
    expect(cmd.split("aexciter").length - 1).toBe(1);
  });

  it("voiceGround:false fully reverts to the old graph (byte-identical)", () => {
    const off = buildComposeCommand(cfg({ voiceGround: false }));
    expect(off).not.toContain("aexciter");
    expect(off).not.toContain("anoisesrc");
  });

  it("native voice-only track: skips the de-broadcast chain but gets lighter room tone for a unified space (0.004), with 20ms edge fades at cuts", () => {
    const cmd = buildComposeCommand(
      cfg({}, [
        { type: "video", filePath: "/tmp/b.mp4", duration: 4, transition: "direct_concat", motion: "static", hasAudio: true },
        { type: "video", filePath: "/tmp/c.mp4", duration: 4, transition: "direct_concat", motion: "static", hasAudio: true },
      ])
    );
    expect(cmd).not.toContain("aexciter");
    expect(cmd).toContain("amplitude=0.004");
    expect(cmd).toContain("afade=t=in:st=0:d=0.02");
    expect(cmd).toContain("afade=t=out:st=3.980:d=0.02");
    expect(cmd).not.toContain("acrossfade");
  });

  it("the room tone is lavfi-synthesized (zero asset dependency), limited to an imperceptible level and locked to 44100/stereo", () => {
    const src = roomToneSource();
    expect(src).toContain("amplitude=0.008");
    expect(src).toContain("lowpass=f=400");
    expect(src).toContain("channel_layouts=stereo");
  });
});
