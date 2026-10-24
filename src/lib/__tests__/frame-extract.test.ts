import { describe, it, expect } from "vitest";
import { execFile } from "child_process";
import { promisify } from "util";
import { stat, mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { ffmpegBin } from "../ffmpeg-path";
import { extractFirstFrame, extractFrameAtTime, extractLastFrame, THUMB_SUFFIX, LAST_FRAME_SUFFIX } from "../video-composer/frame-extract";

const execFileAsync = promisify(execFile);

// Real-ffmpeg contract test for the two frame primitives: the poster thumbnail (works feed /
// project cards) and the tail frame (seam chaining). A synthetic 1s clip keeps it fast.
describe("frame extraction (first-frame cover + tail frame for continuation)", () => {
  it("extracts a first-frame thumbnail and tail frame from a real video, both non-empty files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cf-frame-"));
    const video = join(dir, "clip.mp4");
    try {
      await execFileAsync(ffmpegBin(), [
        "-nostdin", "-v", "error", "-y",
        "-f", "lavfi", "-i", "testsrc=size=320x240:rate=10:duration=1",
        "-pix_fmt", "yuv420p", video,
      ], { timeout: 60_000 });

      const thumb = await extractFirstFrame(video);
      expect(thumb).toBe(`${video}${THUMB_SUFFIX}`);
      expect((await stat(thumb!)).size).toBeGreaterThan(0);

      const tail = await extractLastFrame(video);
      expect(tail).toBe(`${video}${LAST_FRAME_SUFFIX}`);
      expect((await stat(tail!)).size).toBeGreaterThan(0);

      const exactPath = join(dir, "middle.jpg");
      const exact = await extractFrameAtTime(video, 0.5, exactPath);
      expect(exact).toBe(exactPath);
      expect((await stat(exact!)).size).toBeGreaterThan(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 90_000);

  it("returns undefined when the input does not exist (best-effort, no throw, no block)", async () => {
    expect(await extractFirstFrame("/nonexistent/nope.mp4")).toBeUndefined();
  });
});
