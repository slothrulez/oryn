import { describe, it, expect } from "vitest";
import { buildUserPrompt, buildBatchPrompt } from "@/lib/script-engine/prompts";
import type { ScriptGenerationInput } from "@/lib/script-engine/prompts";
import { extractJSON, parseScriptResponse, reasoningParams, batchCountFor } from "@/lib/script-engine/generator";
import { buildComposeCommand, buildComposeInvocation, resolveSubtitleFontFamily, composeErrorMessage, buildDrawtext, type ComposeConfig } from "@/lib/video-composer/composer";

// ==================== Prompt build tests ====================

describe("buildUserPrompt", () => {
  const baseInput: ScriptGenerationInput = {
    productName: "Amino Acid Facial Cleanser",
    category: "beauty",
    styleType: "pain_point",
    targetDuration: 25,
  };

  it("includes the reference-structure block when a template is applied", () => {
    const withRef = buildBatchPrompt({ ...baseInput, referenceStructure: "1. [hook] 3s voiceover reference: \"Still struggling...\"" }, 3);
    expect(withRef).toContain("1. [hook] 3s voiceover reference");
    expect(withRef).toContain("Still struggling...");
    // should not appear when no template is provided
    const noRef = buildBatchPrompt(baseInput, 3);
    expect(noRef).not.toContain("voiceover reference");
  });

  it("builds a valid prompt from basic params", () => {
    const prompt = buildUserPrompt(baseInput);
    expect(prompt).toBeTruthy();
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
  });

  it("output format asks the LLM for searchTerms (stock search keywords)", () => {
    const prompt = buildUserPrompt(baseInput);
    expect(prompt).toContain("searchTerms");
  });

  it("includes product name and category", () => {
    const prompt = buildUserPrompt(baseInput);
    expect(prompt).toContain("Amino Acid Facial Cleanser");
    expect(prompt).toMatch(/Category: .*beauty/i);
  });

  it("platform=tiktok injects the TikTok Shop structure guidance", () => {
    const prompt = buildUserPrompt({ ...baseInput, platforms: "tiktok" });
    expect(prompt).toContain("TikTok Shop");
    expect(prompt).toContain("three-part");
    expect(prompt).toContain("Four high-converting formats");
    expect(prompt).toContain("shop tab");
  });

  it("includes the video-mode instruction", () => {
    const input: ScriptGenerationInput = {
      ...baseInput,
      videoMode: "scene_demo",
    };
    const prompt = buildUserPrompt(input);
    expect(prompt).toContain("Scene demo");
  });

  it("defaults to the product_closeup video mode", () => {
    const prompt = buildUserPrompt(baseInput);
    expect(prompt).toContain("Product close-up");
  });

  it("injects the character description when a character is set", () => {
    const input: ScriptGenerationInput = {
      ...baseInput,
      videoMode: "live_presenter",
      character: {
        id: "char-001",
        name: "Mia",
        appearance: "25-year-old woman, long hair, fair skin",
        voiceStyle: "gentle female voice",
      },
    };
    const prompt = buildUserPrompt(input);
    expect(prompt).toContain("Mia");
    expect(prompt).toContain("25-year-old woman, long hair, fair skin");
    expect(prompt).toContain("gentle female voice");
    expect(prompt).toContain("char-001");
  });

  it("omits the character section when there is no character", () => {
    const prompt = buildUserPrompt(baseInput);
    // should not contain a dedicated character description section (note: OUTPUT_FORMAT_PROMPT template may include a characterId field description, which is a format definition, not a character injection)
    expect(prompt).not.toContain("[ON-CAMERA PRESENTER]");
    expect(prompt).not.toContain("- Appearance:");
  });

  it("includes the style instruction", () => {
    const prompt = buildUserPrompt(baseInput);
    // pain_point style should contain the pain-point instruction
    expect(prompt).toContain("Pain point");
  });

  it("includes custom requirements", () => {
    const input: ScriptGenerationInput = {
      ...baseInput,
      customRequirements: "Emphasize ingredient safety",
    };
    const prompt = buildUserPrompt(input);
    expect(prompt).toContain("Emphasize ingredient safety");
  });

  it("includes the target duration", () => {
    const prompt = buildUserPrompt(baseInput);
    expect(prompt).toContain("25 seconds");
  });

  it("always appends the English language instruction", () => {
    const p = buildUserPrompt({ productName: "Glow Serum", category: "beauty", styleType: "pain_point", productDescription: "fades dark spots in 2 weeks" });
    expect(p).toContain("LANGUAGE");
  });

});

// ==================== FFmpeg command generation tests ====================

describe("buildComposeCommand", () => {
  const baseConfig: ComposeConfig = {
    projectId: "test-project-001",
    clips: [
      { type: "image", filePath: "/data/img1.jpg", duration: 3, transition: "direct_concat", motion: "zoom_in_slow" },
      { type: "video", filePath: "/data/clip2.mp4", duration: 5, transition: "ffmpeg_fade" },
    ],
    output: {
      resolution: "1080p",
      aspectRatio: "9:16",
    },
  };

  it("basic compose command format is correct", () => {
    const cmd = buildComposeCommand(baseConfig);
    expect(cmd).toContain("ffmpeg");
    expect(cmd).toContain("-filter_complex");
    expect(cmd).toContain("libx264");
    expect(cmd).toContain("1080");
    expect(cmd).toContain("1920");
  });

  it("includes every input file", () => {
    const cmd = buildComposeCommand(baseConfig);
    expect(cmd).toContain("/data/img1.jpg");
    expect(cmd).toContain("/data/clip2.mp4");
  });

  it("image inputs use the loop parameter", () => {
    const cmd = buildComposeCommand(baseConfig);
    expect(cmd).toContain("-loop 1 -t 3");
  });

  it("GIF inputs carry no -loop (the gif demuxer rejects image2's loop option and ffmpeg 8+ hard-errors; free stock sources really do return gifs)", () => {
    const cmd = buildComposeCommand({
      ...baseConfig,
      clips: [
        { type: "image", filePath: "/data/anim.gif", duration: 3, transition: "direct_concat", motion: "zoom_in_slow" },
        { type: "image", filePath: "/data/img1.jpg", duration: 3, transition: "direct_concat", motion: "zoom_in_slow" },
      ],
    });
    expect(cmd).toContain('-i "/data/anim.gif"');
    expect(cmd).not.toContain('-loop 1 -t 3 -i "/data/anim.gif"');
    expect(cmd).toContain('-loop 1 -t 3 -i "/data/img1.jpg"');
  });

  it("subtitle bottom margin adapts to the product card: no card lifts it to h*0.78 (clears the 2026 platform bottom UI area), with a card it stays at h*0.83 right below the card", () => {
    const sub = { texts: [{ text: "Test subtitle", startTime: 0, endTime: 3 }], position: "bottom" as const };
    // no product card → not constrained by card-above-text stacking, caption bottom edge raised to h*0.78
    const noCard = buildComposeCommand({ ...baseConfig, subtitle: sub });
    expect(noCard).toContain("h*0.78-text_h");
    expect(noCard).not.toContain("h*0.83-text_h");
    // with product card → pinned to h*0.83 (going higher would collide with the product card at bottom offset 0.25)
    const withCard = buildComposeCommand({ ...baseConfig, subtitle: sub, productCard: { imagePath: "/data/prod.jpg", name: "Test", price: "$9.9" } });
    expect(withCard).toContain("h*0.83-text_h");
    expect(withCard).not.toContain("h*0.78-text_h");
  });

  it("empty clips throw a readable error (otherwise -map [v0] points at a missing stream)", () => {
    expect(() => buildComposeCommand({ ...baseConfig, clips: [] })).toThrow(/Nothing to compose/);
  });

  it("font path uses the path escaper (audit fix: Windows C:\\ backslashes → forward slashes + colon escape, instead of the drawtext text escaper wrecking the path)", () => {
    const cmd = buildComposeCommand({
      ...baseConfig,
      subtitle: { texts: [{ text: "Test", startTime: 0, endTime: 3 }], fontFile: "C:\\fonts\\f.ttf", position: "bottom" },
    });
    expect(cmd).toContain("fontfile='C\\:/fonts/f.ttf'"); // escapeSubtitlesPath: \\ → / and : → \:
  });

  it("image clips pad exactly to clip.duration (zoompan+tpad+trim prevents cumulative drift)", () => {
    const cmd = buildComposeCommand(baseConfig);
    // image clip (img1, duration 3): zoompan camera motion + tpad clone last frame + trim to exact 3s
    expect(cmd).toContain("zoompan");
    expect(cmd).toContain("tpad=stop_mode=clone:stop_duration=3");
    expect(cmd).toContain("trim=duration=3");
  });

  it("BGM + voiceover mix correctly (normalize=0 does not halve the voiceover, aloop fills the length)", () => {
    const config: ComposeConfig = {
      ...baseConfig,
      // audioPath triggers the voiceover audio track, goes through amix (voiceover+BGM) path
      clips: [
        { type: "image", filePath: "/data/img1.jpg", duration: 3, transition: "direct_concat", motion: "static", audioPath: "/data/tts1.mp3" },
        { type: "video", filePath: "/data/clip2.mp4", duration: 5, transition: "ffmpeg_fade" },
      ],
      output: { ...baseConfig.output, bgmPath: "/data/bgm.mp3", bgmVolume: 0.5 },
    };
    const cmd = buildComposeCommand(config);
    expect(cmd).toContain("/data/bgm.mp3");
    expect(cmd).toContain("volume=0.5");
    expect(cmd).toContain("audio_final");
    expect(cmd).toContain("amix=inputs=2");
    expect(cmd).toContain("normalize=0"); // don't cut voiceover volume to ~50%
    expect(cmd).toContain("aloop=loop=-1"); // BGM loops to fill the full video
    // BGM fade-out 3s at end, lands at total duration (3 + 5 - 0.5 = 7.5) tail → st=4.500
    expect(cmd).toContain("afade=t=out");
    expect(cmd).toContain("st=4.500");
    expect(cmd).not.toContain("atrim=start="); // intro skip is opt-in by default
  });

  it("skipping the BGM intro is opt-in (atrim=start appears only when bgmIntroSkipSec is set)", () => {
    const config: ComposeConfig = {
      ...baseConfig,
      clips: [{ type: "image", filePath: "/data/img1.jpg", duration: 3, transition: "direct_concat", motion: "static", audioPath: "/data/tts1.mp3" }],
      output: { ...baseConfig.output, bgmPath: "/data/bgm.mp3", bgmIntroSkipSec: 2 },
    };
    expect(buildComposeCommand(config)).toContain("atrim=start=2");
  });

  it("BGM voiceover ducking is opt-in (bgmDuck → sidechaincompress + asplit copies the voiceover as the sidechain key)", () => {
    const config: ComposeConfig = {
      ...baseConfig,
      clips: [{ type: "image", filePath: "/data/img1.jpg", duration: 3, transition: "direct_concat", motion: "static", audioPath: "/data/tts1.mp3" }],
      output: { ...baseConfig.output, bgmPath: "/data/bgm.mp3", bgmDuck: true },
    };
    const cmd = buildComposeCommand(config);
    expect(cmd).toContain("sidechaincompress");
    expect(cmd).toContain("asplit=2[nar_mix][nar_key]");
    expect(cmd).toContain("normalize=0"); // mix core still normalize=0 (don't cut voiceover volume)
  });

  it("voiceover ducking is off by default (no sidechaincompress)", () => {
    const config: ComposeConfig = {
      ...baseConfig,
      clips: [{ type: "image", filePath: "/data/img1.jpg", duration: 3, transition: "direct_concat", motion: "static", audioPath: "/data/tts1.mp3" }],
      output: { ...baseConfig.output, bgmPath: "/data/bgm.mp3" },
    };
    expect(buildComposeCommand(config)).not.toContain("sidechaincompress");
  });

  it("no ending fade-out when bgmFadeOutSec=0", () => {
    const config: ComposeConfig = {
      ...baseConfig,
      clips: [{ type: "image", filePath: "/data/img1.jpg", duration: 3, transition: "direct_concat", motion: "static", audioPath: "/data/tts1.mp3" }],
      output: { ...baseConfig.output, bgmPath: "/data/bgm.mp3", bgmFadeOutSec: 0 },
    };
    expect(buildComposeCommand(config)).not.toContain("afade=t=out");
  });

  it("audio tracks are extracted correctly when clips have audio", () => {
    const config: ComposeConfig = {
      ...baseConfig,
      clips: [
        { type: "video", filePath: "/data/clip1.mp4", duration: 3, transition: "direct_concat", hasAudio: true },
        { type: "video", filePath: "/data/clip2.mp4", duration: 5, transition: "direct_concat", hasAudio: false },
      ],
    };
    const cmd = buildComposeCommand(config);
    // first clip has native audio, should be extracted and aligned to its duration
    expect(cmd).toContain("[0:a]aresample=44100,apad,atrim=duration=3,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.02,afade=t=out:st=2.980:d=0.02[a0]");
    // second clip has no audio, should generate silence
    expect(cmd).toContain("anullsrc");
  });

  it("TTS voiceover clips take priority over native audio and are aligned by duration as extra inputs", () => {
    const config: ComposeConfig = {
      ...baseConfig,
      clips: [
        { type: "image", filePath: "/data/img1.jpg", duration: 4, transition: "direct_concat", motion: "static", audioPath: "/data/tts1.mp3" },
        { type: "image", filePath: "/data/img2.jpg", duration: 3, transition: "direct_concat", motion: "static" },
      ],
    };
    const cmd = buildComposeCommand(config);
    // TTS audio as extra input (index 2, after the two image inputs), apad/atrim aligned to 4s
    expect(cmd).toContain('-i "/data/tts1.mp3"');
    expect(cmd).toContain("apad,atrim=duration=4");
    // second clip without voiceover generates silence
    expect(cmd).toContain("anullsrc");
  });

  it("subtitle render parameters are correct", () => {
    const config: ComposeConfig = {
      ...baseConfig,
      subtitle: {
        texts: [
          { text: "Limited-time deal", startTime: 0, endTime: 3 },
          { text: "Buy now", startTime: 3, endTime: 5 },
        ],
        fontSize: 40,
        color: "yellow",
        position: "bottom",
      },
    };
    const cmd = buildComposeCommand(config);
    expect(cmd).toContain("drawtext");
    expect(cmd).toContain("fontsize=40");
    expect(cmd).toContain("fontcolor=yellow");
    expect(cmd).toContain("h*0.78-text_h"); // this config has no product card → caption raised to 0.22 bottom margin (h*0.78) to clear 2026 platform bottom UI area, measured from text block bottom edge upward
    expect(cmd).toContain("line_spacing="); // multi-line line spacing
    expect(cmd).toContain("box=1:boxcolor=black@0.45"); // caption background box
  });

  it("subtitles/overlays containing a percent sign use expansion=none + a literal % (escaping as \\% makes ffmpeg 8.0 blank the whole line with Stray %)", () => {
    const config: ComposeConfig = {
      ...baseConfig,
      subtitle: { texts: [{ text: "Save 50% no-brainer", startTime: 0, endTime: 3 }], position: "bottom" },
      overlays: [{ text: "50% off everything, 30% off now", style: "price", startTime: 0, endTime: 3 }],
    };
    const cmd = buildComposeCommand(config);
    // all drawtext entries must include expansion=none (disable % expansion)
    const drawCount = (cmd.match(/drawtext=/g) || []).length;
    const expCount = (cmd.match(/expansion=none/g) || []).length;
    expect(drawCount).toBeGreaterThan(0);
    expect(expCount).toBe(drawCount);
    // text contains literal 50% / 30%, must not be escaped to 50\% / 30\%
    expect(cmd).toContain("50%");
    expect(cmd).toContain("30%");
    expect(cmd).not.toContain("50\\%");
    expect(cmd).not.toContain("30\\%");
  });

  it("long label text wraps into centered multiple lines (keeps large overlays from overflowing horizontally)", () => {
    const short: ComposeConfig = {
      ...baseConfig,
      overlays: [{ text: "Great find", style: "title", startTime: 0, endTime: 3 }],
    };
    const long: ComposeConfig = {
      ...baseConfig,
      overlays: [{ text: "My coworker thought I spent three thousand on my face but I only used this one serum", style: "title", startTime: 0, endTime: 3 }],
    };
    const shortLines = (buildComposeCommand(short).match(/drawtext=/g) || []).length;
    const longLines = (buildComposeCommand(long).match(/drawtext=/g) || []).length;
    // everything else identical → the extra drawtext entries are the wrapped lines of the long tag
    expect(longLines).toBeGreaterThan(shortLines);
  });

  it("file paths with special characters are escaped correctly", () => {
    const config: ComposeConfig = {
      ...baseConfig,
      clips: [
        { type: "video", filePath: '/data/my "video".mp4', duration: 3, transition: "direct_concat" },
        { type: "video", filePath: "/data/file$name.mp4", duration: 5, transition: "direct_concat" },
      ],
    };
    const cmd = buildComposeCommand(config);
    // double quotes and $ should be escaped
    expect(cmd).not.toContain('my "video"');
    expect(cmd).toContain('\\"');
    expect(cmd).toContain("\\$");
  });

  it("product card overlay (opt-in): overlays a product thumbnail + product name", () => {
    const config: ComposeConfig = {
      ...baseConfig,
      productCard: { imagePath: "/data/prod.jpg", name: "CloudSoft", price: "$39.90" },
    };
    const cmd = buildComposeCommand(config);
    expect(cmd).toContain("/data/prod.jpg"); // product image as input
    expect(cmd).toContain("[pcard]"); // thumbnail scale stream
    expect(cmd).toContain("overlay="); // overlay
    expect(cmd).toContain("CloudSoft"); // product name drawtext
    expect(cmd).toContain("39.90"); // price drawtext
    // should not appear when productCard is not provided
    expect(buildComposeCommand(baseConfig)).not.toContain("[pcard]");
  });

  it("final audio is loudness-normalized (loudnorm EBU R128, ~-14 LUFS)", () => {
    const config: ComposeConfig = {
      ...baseConfig,
      clips: [{ type: "image", filePath: "/data/img1.jpg", duration: 3, transition: "direct_concat", motion: "static", audioPath: "/data/tts1.mp3" }],
    };
    const cmd = buildComposeCommand(config);
    expect(cmd).toContain("loudnorm=I=-14");
    expect(cmd).toContain("[audio_norm]");
    expect(cmd).toContain('-map "[audio_norm]"');
  });

  it("the final video gets implicit AIGC marker metadata in the right place without polluting filter_complex", () => {
    const cmd = buildComposeCommand(baseConfig);
    expect(cmd).toContain("-metadata comment=");
    expect(cmd).toContain("AIGC=1");
    expect(cmd).toContain("Oryn");
    expect(cmd).toContain(baseConfig.projectId); // content production id = projectId
    // -metadata appears after -movflags and before the final output file
    expect(cmd.indexOf("-metadata")).toBeGreaterThan(cmd.indexOf("-movflags"));
    expect(cmd.lastIndexOf("-metadata")).toBeLessThan(cmd.lastIndexOf(".mp4"));
    // filter_complex is still intact (not corrupted by metadata)
    expect(cmd).toContain("-filter_complex");
  });

  it("xfade transitions set offset correctly", () => {
    const cmd = buildComposeCommand(baseConfig);
    // ffmpeg_fade transition should include xfade
    expect(cmd).toContain("xfade=transition=fade");
    expect(cmd).toContain("duration=0.5");
    // offset = previous clip duration - fadeDuration = 3 - 0.5 = 2.5
    expect(cmd).toContain("offset=2.5");
  });

  it("with mixed transitions across clips the xfade offset is relative to the cumulative stream duration (never truncates already-joined footage)", () => {
    const config: ComposeConfig = {
      ...baseConfig,
      clips: [
        { type: "image", filePath: "/d/1.jpg", duration: 3, transition: "direct_concat", motion: "static" },
        { type: "image", filePath: "/d/2.jpg", duration: 4, transition: "ffmpeg_fade", motion: "static" },
        { type: "image", filePath: "/d/3.jpg", duration: 4, transition: "direct_concat", motion: "static" },
        { type: "image", filePath: "/d/4.jpg", duration: 3, transition: "ffmpeg_fade", motion: "static" },
      ],
    };
    const cmd = buildComposeCommand(config);
    // first xfade (i=1): offset = cumulative 3 - 0.5 = 2.5
    expect(cmd).toContain("offset=2.5");
    // second xfade (i=3): cumulative = 3 + 4-0.5(fade) + 4(concat) = 10.5 → offset = 10.5 - 0.5 = 10
    expect(cmd).toContain("offset=10");
    // must never use the wrong algorithm of "previous clip duration - 0.5 = 2.5" causing second fade offset=2.5 again
    expect(cmd).not.toContain("offset=2.5:");
  });

  it("ffmpeg_fade: video tpad padding + audio acrossfade mirroring xfade + output limited to the real duration (fixes A/V drift)", () => {
    const config: ComposeConfig = {
      ...baseConfig,
      clips: [
        { type: "video", filePath: "/d/1.webm", duration: 4, transition: "direct_concat", audioPath: "/d/a1.mp3" },
        { type: "video", filePath: "/d/2.webm", duration: 4, transition: "ffmpeg_fade", audioPath: "/d/a2.mp3" },
        { type: "video", filePath: "/d/3.webm", duration: 3, transition: "ffmpeg_fade", audioPath: "/d/a3.mp3" },
      ],
    };
    const cmd = buildComposeCommand(config);
    // short video frame-padding: tpad clones last frame then trim, ensuring video clip equals scene duration (free footage varies in length, no black tail)
    expect(cmd).toContain("tpad=stop_mode=clone:stop_duration=4");
    // audio track mirrors video xfade: ffmpeg_fade boundaries use acrossfade (not plain concat), synchronized with video to shorten by 0.5s per transition
    expect(cmd).toContain("acrossfade=d=0.5");
    // output capped to video real timeline accumulated = 4 + (4-0.5) + (3-0.5) = 10.0, avoiding tail audio covering frozen frame
    expect(cmd).toContain("-t 10.000");
  });

  it("output file path is correct", () => {
    const cmd = buildComposeCommand(baseConfig);
    expect(cmd).toContain("test-project-001");
    expect(cmd).toMatch(/final_\d+\.mp4/);
  });

  it("every video clip normalizes pixel format/SAR/frame rate/timebase (prevents xfade/concat crashes with mixed real footage)", () => {
    const cmd = buildComposeCommand(baseConfig);
    // both clips (image + video) should have unified normalization suffix, otherwise mixed pixel format footage causes ffmpeg errors
    expect(cmd).toContain("format=yuv420p,setsar=1,fps=30,settb=AVTB[v0]");
    expect(cmd).toContain("format=yuv420p,setsar=1,fps=30,settb=AVTB[v1]");
  });

  it("render quality preset: uses the output's videoPreset/crf encoding parameters", () => {
    const cmd = buildComposeCommand({
      ...baseConfig,
      output: { ...baseConfig.output, videoPreset: "slow", crf: 17 },
    });
    expect(cmd).toContain("-preset slow -crf 17");
  });

  it("missing encoding parameters fall back to medium/18", () => {
    const cmd = buildComposeCommand(baseConfig);
    expect(cmd).toContain("-preset medium -crf 18");
  });

  it("invalid videoPreset is whitelisted back to medium (injection guard)", () => {
    const cmd = buildComposeCommand({
      ...baseConfig,
      output: { ...baseConfig.output, videoPreset: "evil; rm -rf /", crf: 20 },
    });
    expect(cmd).toContain("-preset medium -crf 20");
    expect(cmd).not.toContain("rm -rf");
  });
});

// buildComposeInvocation is the shell-free form composeVideo actually runs (execFile + -filter_complex_script).
// It exists specifically to fix the Windows compose failure (issue #13): a real command is ~12k chars with
// embedded newlines, which overruns cmd.exe's 8191-char limit and breaks on newlines when run via a shell.
describe("buildComposeInvocation (shell-free execution form: fixes the Windows compose hang, issue #13)", () => {
  const cfg: ComposeConfig = {
    projectId: "p1",
    clips: [
      // Windows-style absolute path with a space + backslashes — must be passed RAW (no shell escaping/quoting)
      { type: "image", filePath: "C:\\oryn app\\data\\s0.png", duration: 3, transition: "direct_concat", motion: "static" },
    ],
    output: { resolution: "1080p", aspectRatio: "9:16" },
    // ASCII colon in subtitle text stresses the filtergraph escaping across the two forms
    subtitle: { texts: [{ text: "a:b", startTime: 0, endTime: 3 }], position: "bottom" },
  };

  it("input paths pass through as separate argv tokens unchanged (no quotes, no backslash escaping)", () => {
    const inv = buildComposeInvocation(cfg);
    expect(inv.inputArgs[0]).toBe("-y");
    // raw path present verbatim as one token — not `"C:\\..."` shell-quoted, not backslash-doubled
    expect(inv.inputArgs).toContain("C:\\oryn app\\data\\s0.png");
    expect(inv.inputArgs).toContain("-i");
    // no argv token carries the giant filtergraph or an embedded newline (that lives in the script file)
    expect(inv.inputArgs.every((a) => !a.includes("\n"))).toBe(true);
    expect(inv.outputArgs.every((a) => !a.includes("\n"))).toBe(true);
  });

  it("video streams map from the raw [vN] and the output path is the last token (no shell quotes)", () => {
    const inv = buildComposeInvocation(cfg);
    expect(inv.outputArgs).toContain("-map");
    expect(inv.outputArgs.some((a) => /^\[[^\]]+\]$/.test(a))).toBe(true); // e.g. "[sub_out]" — raw, unquoted
    expect(inv.outputArgs[inv.outputArgs.length - 1]).toBe(inv.outputPath);
    expect(inv.outputPath).toMatch(/final_\d+\.mp4$/);
  });

  it("the filtergraph uses direct escaping (colon \\: single backslash) while the command-string form keeps the shell-reserved \\\\:", () => {
    const inv = buildComposeInvocation(cfg);
    const cmd = buildComposeCommand(cfg);
    // shell string form keeps the doubled backslash a real shell would halve
    expect(cmd).toContain("a\\\\:b");
    // script/execFile form is the post-shell direct form: single backslash before the colon
    expect(inv.filterComplex).toContain("a\\:b");
    expect(inv.filterComplex).not.toContain("a\\\\:b");
  });
});

// ==================== Script generator JSON parsing tests ====================

describe("reasoningParams (tames reasoning/thinking models per endpoint)", () => {
  it("Pollinations endpoint → injects reasoning_effort:low (otherwise reasoning models exhaust the output budget and return empty content)", () => {
    expect(reasoningParams("https://text.pollinations.ai/openai")).toEqual({ reasoning_effort: "low" });
    expect(reasoningParams("https://TEXT.POLLINATIONS.AI/openai")).toEqual({ reasoning_effort: "low" });
  });
  it("other endpoints (real OpenAI/local) → not injected (OpenAI rejects unknown parameters with 400)", () => {
    expect(reasoningParams("https://api.openai.com/v1")).toEqual({});
    expect(reasoningParams("http://localhost:11434/v1")).toEqual({});
    expect(reasoningParams("")).toEqual({});
  });
});

describe("batchCountFor (Pollinations' low output cap → generate only 1 set to avoid truncating multiple sets)", () => {
  it("Pollinations → 1 (3 sets of ~7500 characters exceed the output cap and truncate into invalid JSON)", () => {
    expect(batchCountFor("https://text.pollinations.ai/openai")).toBe(1);
    expect(batchCountFor("https://text.pollinations.ai/openai", 5)).toBe(1); // ignores the requested count,forces 1
  });
  it("other endpoints → keep the requested set count (default 3)", () => {
    expect(batchCountFor("https://api.openai.com/v1")).toBe(3);
    expect(batchCountFor("http://localhost:11434/v1", 5)).toBe(5);
    expect(batchCountFor("")).toBe(3);
  });
});

describe("extractJSON", () => {
  it("plain JSON parses", () => {
    const input = '{"title":"Test script","shots":[]}';
    const result = extractJSON(input);
    expect(result).toBe('{"title":"Test script","shots":[]}');
    // confirm it can be correctly parsed by JSON.parse
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it("JSON wrapped in a markdown code block parses", () => {
    const input = '```json\n{"title":"Test script","shots":[]}\n```';
    const result = extractJSON(input);
    expect(result).toBe('{"title":"Test script","shots":[]}');
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it("a markdown code block without a language tag also parses", () => {
    const input = '```\n{"title":"Test script","shots":[]}\n```';
    const result = extractJSON(input);
    expect(result).toBe('{"title":"Test script","shots":[]}');
  });

  it("JSON with leading text can be extracted", () => {
    const input = 'Sure, here is the generated script:\n{"title":"Test script","shots":[]}';
    const result = extractJSON(input);
    expect(() => JSON.parse(result)).not.toThrow();
    const parsed = JSON.parse(result);
    expect(parsed.title).toBe("Test script");
  });

  it("array-format JSON can be extracted", () => {
    const input = '[{"title":"Script 1"},{"title":"Script 2"}]';
    const result = extractJSON(input);
    expect(() => JSON.parse(result)).not.toThrow();
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
  });
});

describe("parseScriptResponse", () => {
  it("parses a single script object", () => {
    const content = JSON.stringify({
      title: "Test script",
      totalDuration: 20,
      shots: [
        { shotId: 1, type: "hook", duration: 3, description: "Opening", camera: "Close-up", visualSource: "ai_generate", transition: "direct_concat", voiceover: "Hi everyone" },
        { shotId: 2, type: "cta", duration: 3, description: "Ending", camera: "Medium shot", visualSource: "product_image", transition: "direct_concat", voiceover: "Buy it now" },
      ],
    });
    const scripts = parseScriptResponse(content, "pain_point");
    expect(scripts).toHaveLength(1);
    expect(scripts[0].title).toBe("Test script");
    expect(scripts[0].shots).toHaveLength(2);
  });

  it("parses the scripts-array wrapper format", () => {
    const content = JSON.stringify({
      scripts: [
        { title: "Script 1", totalDuration: 20, shots: [{ shotId: 1, type: "hook", duration: 3, description: "a", camera: "b", visualSource: "ai_generate", transition: "direct_concat", voiceover: "c" }] },
        { title: "Script 2", totalDuration: 25, shots: [{ shotId: 1, type: "hook", duration: 3, description: "d", camera: "e", visualSource: "ai_generate", transition: "direct_concat", voiceover: "f" }] },
      ],
    });
    const scripts = parseScriptResponse(content, "scene");
    expect(scripts).toHaveLength(2);
    expect(scripts[0].title).toBe("Script 1");
    expect(scripts[1].title).toBe("Script 2");
  });

  it("invalid JSON throws a helpful error", () => {
    expect(() => parseScriptResponse("this is not JSON", "pain_point")).toThrow("not valid JSON");
  });

  it("unrecognized JSON structure throws", () => {
    const content = JSON.stringify({ foo: "bar" });
    expect(() => parseScriptResponse(content, "pain_point")).toThrow("Could not parse");
  });

  it("batch entries with only a title and no shots are dropped; only those with shots are kept", () => {
    const content = JSON.stringify({
      scripts: [
        { title: "Incomplete" }, // missing shots → should be discarded
        { title: "Complete", totalDuration: 6, shots: [{ shotId: 1, type: "hook", duration: 3, description: "a", camera: "b", visualSource: "ai_generate", transition: "direct_concat", voiceover: "c" }] },
      ],
    });
    const scripts = parseScriptResponse(content, "pain_point");
    expect(scripts).toHaveLength(1);
    expect(scripts[0].title).toBe("Complete");
  });

  it("throws when no script has shots (never save a zero-shot script as success)", () => {
    expect(() => parseScriptResponse(JSON.stringify({ scripts: [{ title: "Empty 1" }, { title: "Empty 2", shots: [] }] }), "pain_point")).toThrow("no usable shots");
  });

  it("parses the LLM's searchTerms into stockKeywords (drops empties, trims, at most 3)", () => {
    const content = JSON.stringify({
      title: "t",
      totalDuration: 6,
      shots: [
        { shotId: 1, type: "hook", duration: 3, description: "a", camera: "b", visualSource: "ai_generate", transition: "direct_concat", voiceover: "c",
          searchTerms: [" coffee morning ", "cozy cafe", "", "extra", "fifth"] },
        { shotId: 2, type: "cta", duration: 3, description: "d", camera: "e", visualSource: "ai_generate", transition: "direct_concat", voiceover: "f" },
      ],
    });
    const scripts = parseScriptResponse(content, "scene");
    expect(scripts[0].shots[0].stockKeywords).toEqual(["coffee morning", "cozy cafe", "extra"]);
    expect(scripts[0].shots[1].stockKeywords).toBeUndefined(); // absent if not present
  });

  it("missing Shot fields are filled with defaults", () => {
    const content = JSON.stringify({
      title: "Test",
      shots: [
        { shotId: 1, type: "invalid_type", duration: -1, description: "", camera: "", visualSource: "unknown", transition: "unknown", voiceover: "Check this out" },
      ],
    });
    const scripts = parseScriptResponse(content, "pain_point");
    const shot = scripts[0].shots[0];
    // invalid type should fall back to "demo"
    expect(shot.type).toBe("demo");
    // invalid duration should fall back to 3
    expect(shot.duration).toBe(3);
    // invalid visualSource should fall back to "ai_generate"
    expect(shot.visualSource).toBe("ai_generate");
    // invalid transition should fall back to "ai_start_end" (consistent with schema default and UI default)
    expect(shot.transition).toBe("ai_start_end");
  });

  it("throws when every voiceover is empty instead of returning a script that renders silent", () => {
    const content = JSON.stringify({
      title: "Test",
      shots: [
        { shotId: 1, type: "hook", duration: 3, description: "a", visualSource: "ai_generate", voiceover: "" },
        { shotId: 2, type: "cta", duration: 3, description: "b", visualSource: "ai_generate", voiceover: "   " },
      ],
    });
    expect(() => parseScriptResponse(content, "pain_point")).toThrow(/voiceover/i);
  });

  it("a voiceover that echoes the format description back does not count", () => {
    const content = JSON.stringify({
      title: "Test",
      shots: [
        { shotId: 1, type: "hook", duration: 3, description: "a", visualSource: "ai_generate", voiceover: "Voiceover line: conversational spoken copy, length matched to duration" },
      ],
    });
    expect(() => parseScriptResponse(content, "pain_point")).toThrow(/voiceover/i);
  });

  it("returns normally as long as one shot still has a voiceover (the user can fill in the other)", () => {
    const content = JSON.stringify({
      title: "Test",
      shots: [
        { shotId: 1, type: "hook", duration: 3, description: "a", visualSource: "ai_generate", voiceover: "" },
        { shotId: 2, type: "cta", duration: 3, description: "b", visualSource: "ai_generate", voiceover: "Order now" },
      ],
    });
    expect(parseScriptResponse(content, "pain_point")[0].shots).toHaveLength(2);
  });

  it("missing totalDuration is summed from the shots", () => {
    const content = JSON.stringify({
      title: "Test",
      shots: [
        { shotId: 1, type: "hook", duration: 3, description: "a", camera: "b", visualSource: "ai_generate", transition: "direct_concat", voiceover: "c" },
        { shotId: 2, type: "cta", duration: 5, description: "d", camera: "e", visualSource: "product_image", transition: "direct_concat", voiceover: "f" },
      ],
    });
    const scripts = parseScriptResponse(content, "pain_point");
    expect(scripts[0].totalDuration).toBe(8);
  });

  it("null elements in the scripts array are skipped without crashing (LLMs occasionally return [null, {...}]; before the fix validateScript(null) threw and broke the whole parse)", () => {
    const content = JSON.stringify({
      scripts: [null, { title: "Valid script", shots: [{ duration: 3, voiceover: "Test voiceover" }] }],
    });
    const scripts = parseScriptResponse(content, "pain_point");
    expect(scripts).toHaveLength(1);
    expect(scripts[0].title).toBe("Valid script");
  });

  it("truncated JSON error carries an actionable truncation hint (max_tokens)", () => {
    const truncated = '{"scripts": [{"title": "X", "shots": [';
    expect(() => parseScriptResponse(truncated, "pain_point")).toThrow(/truncat/i);
  });

  it("detects truncation mid-shot even after an earlier shot closed with } (brace counting)", () => {
    // shot 1 is closed with }, shot 2 is cut off — the greedy extract ends with }, but brackets are unbalanced
    const truncated = '{"scripts": [{"title": "X", "totalDuration": 25, "shots": [{"shotId": 1, "type": "hook", "voiceover": "hi"}';
    expect(() => parseScriptResponse(truncated, "pain_point")).toThrow(/truncat/i);
  });
});

describe("bundled full-coverage subtitle font", () => {
  it("the bundled public/fonts/subtitle.ttf (Noto Sans) is selected and the karaoke family name is Noto Sans", () => {
    // bundled font is in the repo (public/fonts/subtitle.ttf) and should take priority over system fonts;
    // karaoke uses libass matching by family name, must resolve to the font's real family name to use the bundled font (otherwise the system font lacks Hangul → tofu blocks)
    expect(resolveSubtitleFontFamily()).toBe("Noto Sans");
  });
});


describe("composeErrorMessage (ffmpeg compose error classification)", () => {
  it("timeout (SIGTERM/killed) → timeout message", () => {
    expect(composeErrorMessage({ killed: true, signal: "SIGTERM" })).toMatch(/timed out/);
    expect(composeErrorMessage({ signal: "SIGTERM" })).toMatch(/timed out/);
  });
  it("disk full (ENOSPC/no space) → disk message", () => {
    expect(composeErrorMessage({ stderr: "av_interleaved_write_frame(): No space left on device" })).toMatch(/disk space/);
    expect(composeErrorMessage({ message: "ENOSPC: no space left" })).toMatch(/disk space/);
  });
  it("other errors → null (rethrown as-is)", () => {
    expect(composeErrorMessage({ message: "Invalid argument" })).toBeNull();
    expect(composeErrorMessage({})).toBeNull();
  });
});

describe("buildDrawtext (drawtext builder: forced escaping + field order)", () => {
  it("text goes through escapeDrawText, fontFile through escapeSubtitlesPath, % kept literal", () => {
    const d = buildDrawtext({ fontFile: "C:\\fonts\\f.ttf", text: "Save 50%", fontSize: 48, fontColor: "white", x: "(w-text_w)/2", y: "h*0.8" });
    expect(d.startsWith("drawtext=")).toBe(true);
    expect(d).toContain("fontfile='C\\:/fonts/f.ttf'"); // path escaper: \\ → / and : → \:
    expect(d).toContain("expansion=none");
    expect(d).toContain("Save 50%"); // % is not escaped (literal under expansion=none)
    expect(d).toContain("fontsize=48");
    expect(d).toContain("x=(w-text_w)/2");
  });
  it("optional fields appear only when set and are omitted by default", () => {
    const bare = buildDrawtext({ text: "x", fontSize: 40, fontColor: "white", x: "0", y: "0" });
    expect(bare).not.toContain("box=1");
    expect(bare).not.toContain("borderw");
    expect(bare).not.toContain("enable");
    const full = buildDrawtext({ text: "x", fontSize: 40, fontColor: "white", borderW: 3, lineSpacing: 10, box: { color: "black@0.45", borderW: 12 }, x: "0", y: "0", enable: "enable='between(t,0,3)'" });
    expect(full).toContain("borderw=3");
    expect(full).toContain("line_spacing=10");
    expect(full).toContain("box=1:boxcolor=black@0.45:boxborderw=12");
    expect(full).toContain("enable='between(t,0,3)'");
  });
});

describe("extractJSON (cleans reasoning-model <think> traces so thinking text does not pollute the JSON)", () => {
  it("JSON after a closed think block is extracted cleanly (braces inside think do not interfere)", () => {
    const input = '<think>let me think {"draft":1} does this work</think>\n{"title":"main feature"}';
    expect(extractJSON(input)).toBe('{"title":"main feature"}');
  });
  it("code fences inside a think block are not mistaken for the output fence", () => {
    const input = '<think>```json\n{"fake":1}\n```</think>{"real":2}';
    expect(JSON.parse(extractJSON(input))).toEqual({ real: 2 });
  });
});

describe("completeWithJsonRetry (re-asks once with the error on a parse failure; capability failures are not retried)", () => {
  type FakeCreate = (params: { messages: { role: string; content: string }[] }) => Promise<{
    choices: { message: { content: string } }[];
  }>;
  const fakeClient = (create: FakeCreate) =>
    ({ chat: { completions: { create } } }) as unknown as import("openai").default;
  const reply = (content: string) => ({ choices: [{ message: { content } }] });

  it("bad JSON first → re-ask with the parse error → second attempt succeeds", async () => {
    const seen: { role: string; content: string }[][] = [];
    const client = fakeClient(async ({ messages }) => {
      seen.push(messages);
      return seen.length === 1 ? reply("this is not JSON") : reply('{"ok":true}');
    });
    const { completeWithJsonRetry } = await import("@/lib/script-engine/generator");
    const out = await completeWithJsonRetry(client, { model: "m", messages: [{ role: "user", content: "write JSON" }] }, {}, (c) => {
      return JSON.parse(extractJSON(c)) as { ok: boolean };
    });
    expect(out).toEqual({ ok: true });
    expect(seen[1]).toHaveLength(3);
    expect(seen[1][1]).toMatchObject({ role: "assistant", content: "this is not JSON" });
    expect(seen[1][2].content).toContain("could not be parsed");
  });

  it("both attempts fail → throws the last parse error", async () => {
    const client = fakeClient(async () => reply("still not JSON"));
    const { completeWithJsonRetry } = await import("@/lib/script-engine/generator");
    await expect(
      completeWithJsonRetry(client, { model: "m", messages: [{ role: "user", content: "x" }] }, {}, (c) => JSON.parse(c)),
    ).rejects.toThrow();
  });

  it("LLMRequestError (model capability verdict) is thrown directly without retry", async () => {
    let calls = 0;
    const client = fakeClient(async () => {
      calls++;
      return reply('{"shots":[]}');
    });
    const { completeWithJsonRetry } = await import("@/lib/script-engine/generator");
    const { LLMRequestError } = await import("@/lib/llm-error");
    await expect(
      completeWithJsonRetry(client, { model: "m", messages: [{ role: "user", content: "x" }] }, {}, () => {
        throw new LLMRequestError("model too weak");
      }),
    ).rejects.toThrow("model too weak");
    expect(calls).toBe(1);
  });
});

describe("sanitizeVoiceover (TTS input sanitization: structural markers removed, real copy untouched)", () => {
  it("strips markdown emphasis/code/lists/stage tags and keeps the text", async () => {
    const { sanitizeVoiceover } = await import("@/lib/script-engine/generator");
    expect(sanitizeVoiceover("**great value** choice")).toBe("great value choice");
    expect(sanitizeVoiceover("*one gentle wipe* and it is clean")).toBe("one gentle wipe and it is clean");
    expect(sanitizeVoiceover("`real silk` feel")).toBe("real silk feel");
    expect(sanitizeVoiceover("- the first point matters")).toBe("the first point matters");
    expect(sanitizeVoiceover("[intro] Still worried about hair loss")).toBe("Still worried about hair loss");
    expect(sanitizeVoiceover("[hook] Stop scrolling right now")).toBe("Stop scrolling right now");
  });

  it("real copy is unaffected: brackets, quotes, prices and multiplication signs are kept as-is", async () => {
    const { sanitizeVoiceover } = await import("@/lib/script-engine/generator");
    expect(sanitizeVoiceover("only $9.90 (shipping included), it is amazing")).toBe("only $9.90 (shipping included), it is amazing");
    expect(sanitizeVoiceover("the size is 30 x 40 cm")).toBe("the size is 30 x 40 cm");
  });

  it("input that is all markers is not sanitized to an empty string (better to keep it than produce a mute shot)", async () => {
    const { sanitizeVoiceover } = await import("@/lib/script-engine/generator");
    expect(sanitizeVoiceover("***").length).toBeGreaterThan(0);
  });
});
