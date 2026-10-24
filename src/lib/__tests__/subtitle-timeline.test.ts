import { describe, it, expect } from "vitest";
import { buildSubtitleTimeline, padDurationsForFade } from "@/lib/video-composer/timeline";
import { FADE_DURATION } from "@/lib/video-composer/composer";
import { estimateSpeechSeconds } from "@/lib/tts";

describe("padDurationsForFade (padding for acrossfade eating the tail)", () => {
  it("voiced clips followed by ffmpeg_fade get FADE_DURATION padding", () => {
    const out = padDurationsForFade([
      { duration: 4, transition: "direct_concat", hasVoice: true },
      { duration: 5, transition: "ffmpeg_fade", hasVoice: true },
      { duration: 3, transition: "direct_concat", hasVoice: true },
    ]);
    expect(out).toEqual([4 + FADE_DURATION, 5, 3]);
  });

  it("unvoiced clips are not padded (frozen frames are pointless); the last clip is never padded", () => {
    const out = padDurationsForFade([
      { duration: 4, transition: "direct_concat", hasVoice: false },
      { duration: 5, transition: "ffmpeg_fade", hasVoice: true },
    ]);
    expect(out).toEqual([4, 5]);
  });
});

describe("buildSubtitleTimeline (subtitle/overlay timeline)", () => {
  it("direct concat: seamless between segments, total duration is the sum", () => {
    const { cues, total } = buildSubtitleTimeline([
      { duration: 4, transition: "direct_concat", voiceover: "first segment voiceover, for testing." },
      { duration: 4, transition: "direct_concat", voiceover: "second segment voiceover, for testing." },
    ]);
    expect(total).toBe(8);
    expect(cues[0].startTime).toBe(0);
    expect(cues[cues.length - 1].endTime).toBe(8);
    // no overlap anywhere
    for (let i = 1; i < cues.length; i++)
      expect(cues[i].startTime).toBeGreaterThanOrEqual(cues[i - 1].endTime - 0.001);
  });

  it("ffmpeg_fade: the timeline shifts by FADE_DURATION and cross-segment caption cards do not overprint (issue #14 hidden bug)", () => {
    const { cues, karaokeLines, total } = buildSubtitleTimeline([
      { duration: 4, transition: "direct_concat", voiceover: "the previous segment's unfinished voiceover." },
      { duration: 4, transition: "ffmpeg_fade", voiceover: "the next segment's voiceover cutting in." },
    ]);
    expect(total).toBeCloseTo(8 - FADE_DURATION, 3);
    // second segment starts at 4 - FADE_DURATION; first segment's cards must not spill past it
    const boundary = 4 - FADE_DURATION;
    const firstSegCards = cues.filter((c) => c.startTime < boundary);
    for (const c of firstSegCards) expect(c.endTime).toBeLessThanOrEqual(boundary + 0.001);
    // global invariant: at any moment at most one caption card is visible
    const sorted = [...cues].sort((a, b) => a.startTime - b.startTime);
    for (let i = 1; i < sorted.length; i++)
      expect(sorted[i].startTime).toBeGreaterThanOrEqual(sorted[i - 1].endTime - 0.001);
    // karaoke lines follow the same clamp
    expect(karaokeLines[0].endTime).toBeLessThanOrEqual(boundary + 0.001);
  });

  it("caption cards follow the real speech duration, and the last card holds to the clip end (no blank screen in pauses)", () => {
    const { cues } = buildSubtitleTimeline([
      {
        duration: 6,
        transition: "direct_concat",
        voiceover: "full fizz and a crisp kick, one sip cools you right down; classic cola flavor, the more you drink the better.",
        voiceSec: 5, // 5s of speech + 1s padded tail
      },
    ]);
    // all cards except the held last one live inside the speech window (5 + 0.15 rounding)
    for (const c of cues.slice(0, -1)) expect(c.endTime).toBeLessThanOrEqual(5.15 + 0.001);
    // last card holds through the breathing gap to the segment end
    expect(cues[cues.length - 1].endTime).toBe(6);
  });

  it("overlays follow the cumulative timeline (including the fade shift), unaffected by the voiceover", () => {
    const { overlays } = buildSubtitleTimeline([
      { duration: 4, transition: "direct_concat", overlay: { text: "double the chill", style: "title" } },
      { duration: 4, transition: "ffmpeg_fade", overlay: { text: "$9.9", style: "price" } },
    ]);
    expect(overlays).toHaveLength(2);
    expect(overlays[0]).toMatchObject({ startTime: 0, endTime: 4 });
    expect(overlays[1].startTime).toBeCloseTo(4 - FADE_DURATION, 3);
  });
});

describe("estimateSpeechSeconds (text-based timing fallback when ffprobe fails)", () => {
  it("empty text is 0; non-empty is at least 1s", () => {
    expect(estimateSpeechSeconds("")).toBe(0);
    expect(estimateSpeechSeconds("ok")).toBeGreaterThanOrEqual(1);
  });

  it("the estimate grows monotonically with text length and the speaking rate is in a reasonable range", () => {
    const short = estimateSpeechSeconds("Pepsi, double the chill!");
    const long = estimateSpeechSeconds(
      "Pepsi, double the chill! Full fizz and a crisp kick, one sip cools you right down; classic cola flavor goes with dinner, skewers and hot pot, the more you drink the better."
    );
    expect(long).toBeGreaterThan(short);
    // ~8 CJK chars ≈ 2-4s; full sentence (~38 chars) ≈ 9-14s — sanity band, not exact
    expect(short).toBeGreaterThan(1.5);
    expect(short).toBeLessThan(5);
    expect(long).toBeGreaterThan(8);
    expect(long).toBeLessThan(16);
  });

  it("better long than short: the estimate is slightly above normal speed (underestimating cuts the voice)", () => {
    const text = "this is a short sentence for timing";
    expect(estimateSpeechSeconds(text)).toBeGreaterThan(text.length / 15);
  });
});

describe("word-level timing joins the timeline (real karaoke sync + cards snapping to word boundaries)", () => {
  it("segment words convert to absolute time and attach to karaokeLines; speechEndTime records the speech window", async () => {
    const { buildSubtitleTimeline } = await import("@/lib/video-composer/timeline");
    const tl = buildSubtitleTimeline([
      {
        duration: 5,
        transition: "direct_concat",
        voiceover: "Hello world",
        voiceSec: 2,
        words: [
          { text: "Hi", startSec: 0.2, endSec: 0.9 },
          { text: "world", startSec: 1.0, endSec: 1.8 },
        ],
      },
      {
        duration: 4,
        transition: "direct_concat",
        voiceover: "Second sentence",
        voiceSec: 1.5,
        words: [{ text: "Second sentence", startSec: 0.1, endSec: 1.4 }],
      },
    ]);
    expect(tl.karaokeLines[0].speechEndTime).toBeCloseTo(2.15, 3);
    expect(tl.karaokeLines[0].words).toEqual([
      { text: "Hi", startSec: 0.2, endSec: 0.9 },
      { text: "world", startSec: 1.0, endSec: 1.8 },
    ]);
    expect(tl.karaokeLines[1].words?.[0].startSec).toBeCloseTo(5.1, 3);
  });

  it("snapCuesToWords: card boundaries snap to the nearest word end (within ±0.4s), the outer first/last bounds stay", async () => {
    const { snapCuesToWords } = await import("@/lib/video-composer/timeline");
    const cues = [
      { text: "a", startTime: 0, endTime: 2.0 },
      { text: "b", startTime: 2.0, endTime: 4.0 },
    ];
    snapCuesToWords(cues, [1.85, 3.1]);
    expect(cues[0].endTime).toBe(1.85);
    expect(cues[1].startTime).toBe(1.85);
    expect(cues[1].endTime).toBe(4.0);
  });

  it("snapCuesToWords: no nearby word/would break ordering → unchanged", async () => {
    const { snapCuesToWords } = await import("@/lib/video-composer/timeline");
    const cues = [
      { text: "a", startTime: 0, endTime: 2.0 },
      { text: "b", startTime: 2.0, endTime: 2.2 },
    ];
    snapCuesToWords(cues, [2.19]);
    expect(cues[0].endTime).toBe(2.0);
  });
});
