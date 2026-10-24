import { describe, it, expect } from "vitest";
import { buildComposeInvocation, SPEEDFIT_MAX_RATIO, SPEEDFIT_MIN_RATIO, type ComposeConfig } from "@/lib/video-composer/composer";
import { buildAssetRows, nextChainKeyframe } from "@/lib/assets-view";
import { modelSupportsLastFrame } from "@/lib/video-composer/transitions";
import { buildMotionPrompt } from "@/lib/motion-prompt";
import type { Shot } from "@/lib/db/schema";

/** Minimal compose config with a single video clip; overrides tweak the clip under test. */
function cfg(clip: Partial<ComposeConfig["clips"][number]>): ComposeConfig {
  return {
    projectId: "test-speedfit",
    clips: [
      {
        type: "video",
        filePath: "/tmp/clip.mp4",
        duration: 4,
        transition: "ai_start_end",
        ...clip,
      },
    ],
    output: { resolution: "720p", aspectRatio: "9:16" },
  };
}

describe("composer speed-fit into the slot (preserves the chained tail frame)", () => {
  it("silent video slightly longer than the slot → setpts speeds it into place (keeps both ends)", () => {
    const inv = buildComposeInvocation(cfg({ sourceDuration: 5 }));
    expect(inv.filterComplex).toContain("setpts=PTS/1.2500");
  });

  it("over the clamp ratio → falls back to trimming, no fast-forward look", () => {
    const inv = buildComposeInvocation(cfg({ sourceDuration: 4 * SPEEDFIT_MAX_RATIO * 1.2 }));
    expect(inv.filterComplex).not.toContain("setpts=PTS/");
  });

  it("videos with native audio are never re-timed (avoids A/V desync)", () => {
    const inv = buildComposeInvocation(cfg({ sourceDuration: 5, hasAudio: true }));
    expect(inv.filterComplex).not.toContain("setpts=PTS/");
  });

  it("source slightly shorter than the slot (≥70%) → setpts slows it to fill, eliminating the frozen tail", () => {
    // 3s source in a 4s slot: ratio 0.75 → setpts=PTS/0.7500 stretches real motion across the slot
    const inv = buildComposeInvocation(cfg({ sourceDuration: 3 }));
    expect(inv.filterComplex).toContain("setpts=PTS/0.7500");
  });

  it("source much shorter than the slot (<70%) → falls back to freeze-frame padding, no syrupy slow motion", () => {
    const inv = buildComposeInvocation(cfg({ sourceDuration: 4 * SPEEDFIT_MIN_RATIO * 0.8 }));
    expect(inv.filterComplex).not.toContain("setpts=PTS/");
    expect(inv.filterComplex).toContain("tpad=stop_mode=clone");
  });

  it("short source with native audio → no slow motion (avoids A/V desync)", () => {
    const inv = buildComposeInvocation(cfg({ sourceDuration: 3, hasAudio: true }));
    expect(inv.filterComplex).not.toContain("setpts=PTS/");
  });

  it("no sourceDuration (old assets/probe failure) → behaves as before", () => {
    const inv = buildComposeInvocation(cfg({}));
    expect(inv.filterComplex).not.toContain("setpts=PTS/");
  });
});

describe("chained first/last-frame helpers", () => {
  const shot = (shotId: number, over: Partial<Shot> = {}): Shot =>
    ({
      shotId,
      type: "demo",
      duration: 4,
      description: `shot ${shotId}`,
      camera: "",
      visualSource: "ai_generate",
      transition: "ai_start_end",
      voiceover: "",
      ...over,
    }) as Shot;

  it("nextChainKeyframe: next shot is a completed still → returns its image URL", () => {
    const rows = buildAssetRows(
      [shot(1), shot(2)],
      [
        { shotId: 1, filePath: "/api/files/p/a1.png", status: "done" },
        { shotId: 2, filePath: "/api/files/p/a2.png", status: "done" },
      ],
      []
    );
    expect(nextChainKeyframe(rows, 1)).toBe("/api/files/p/a2.png");
  });

  it("nextChainKeyframe: next shot is a video without a keyframe record/unfinished/missing → undefined", () => {
    const rows = buildAssetRows(
      [shot(1), shot(2), shot(3)],
      [
        { shotId: 1, filePath: "/api/files/p/a1.png", status: "done" },
        { shotId: 2, filePath: "/api/files/p/a2.mp4", status: "done" },
      ],
      []
    );
    expect(nextChainKeyframe(rows, 1)).toBeUndefined(); // next is a video without a recorded keyframe
    expect(nextChainKeyframe(rows, 2)).toBeUndefined(); // next is pending
    expect(nextChainKeyframe(rows, 3)).toBeUndefined(); // last shot
  });

  it("nextChainKeyframe: next shot is already a video but has a stored source keyframe → chains via that keyframe (reruns keep the chain)", () => {
    const rows = buildAssetRows(
      [shot(1), shot(2)],
      [
        { shotId: 1, filePath: "/api/files/p/a1.png", status: "done" },
        { shotId: 2, filePath: "/api/files/p/a2.mp4", status: "done", thumbnailPath: "/api/files/p/kf2.png" },
      ],
      []
    );
    expect(rows[1].keyframeUrl).toBe("/api/files/p/kf2.png");
    expect(nextChainKeyframe(rows, 1)).toBe("/api/files/p/kf2.png");
  });

  it("modelSupportsLastFrame: only the ai_start_end allowlist supports it", () => {
    // Motion 2.5 schema exposes last_image too (verified via official MCP, 2026-08)
    // v0.8.76 new families with a pinned-last-frame param per published schema
    expect(modelSupportsLastFrame("google/veo3.1/image-to-video")).toBe(true);
    // Nova 2.3 has no last-frame param; Reel v3.0 never did
    expect(modelSupportsLastFrame("nova/nova-2.3/i2v-standard")).toBe(false);
    expect(modelSupportsLastFrame("reelai/reel-v3.0-std/image-to-video")).toBe(false);
    expect(modelSupportsLastFrame("")).toBe(false);
  });

  it("chainToNext prompt adds a last-frame transition cue", () => {
    const en = buildMotionPrompt({ shotType: "demo", description: "a hands-on demo", chainToNext: true });
    expect(en).toContain("into the specified last frame");
    expect(buildMotionPrompt({ shotType: "demo", description: "usage demo" })).not.toContain("last frame");
  });
});
