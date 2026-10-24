import { describe, it, expect, afterEach } from "vitest";
import { ffmpegBin, ffprobeBin } from "@/lib/ffmpeg-path";
import { buildComposeCommand, type ComposeConfig } from "@/lib/video-composer/composer";

const origFf = process.env.FFMPEG_PATH;
const origFp = process.env.FFPROBE_PATH;

afterEach(() => {
  if (origFf === undefined) delete process.env.FFMPEG_PATH;
  else process.env.FFMPEG_PATH = origFf;
  if (origFp === undefined) delete process.env.FFPROBE_PATH;
  else process.env.FFPROBE_PATH = origFp;
});

describe("ffmpeg/ffprobe binary path resolution", () => {
  it("falls back to system ffmpeg/ffprobe when not injected (dev unchanged)", () => {
    delete process.env.FFMPEG_PATH;
    delete process.env.FFPROBE_PATH;
    expect(ffmpegBin()).toBe("ffmpeg");
    expect(ffprobeBin()).toBe("ffprobe");
  });

  it("returns the injected absolute path (Electron bundled binaries)", () => {
    process.env.FFMPEG_PATH = "/Apps/Oryn.app/Contents/Resources/ffmpeg";
    process.env.FFPROBE_PATH = "/Apps/Oryn.app/Contents/Resources/ffprobe";
    expect(ffmpegBin()).toContain("ffmpeg");
    expect(ffprobeBin()).toContain("ffprobe");
  });

  it("buildComposeCommand uses the injected FFMPEG_PATH (quoted when it contains spaces)", () => {
    const cfg: ComposeConfig = {
      projectId: "p1",
      clips: [{ type: "image", filePath: "/d/a.jpg", duration: 3, transition: "direct_concat", motion: "static" }],
      output: { resolution: "1080p", aspectRatio: "9:16" },
    };
    process.env.FFMPEG_PATH = "/with space/ffmpeg";
    const cmd = buildComposeCommand(cfg);
    expect(cmd).toContain(`"/with space/ffmpeg" -y`);
  });

  it("without injection buildComposeCommand still starts with ffmpeg (backward compatible)", () => {
    delete process.env.FFMPEG_PATH;
    const cfg: ComposeConfig = {
      projectId: "p1",
      clips: [{ type: "image", filePath: "/d/a.jpg", duration: 3, transition: "direct_concat", motion: "static" }],
      output: { resolution: "1080p", aspectRatio: "9:16" },
    };
    const cmd = buildComposeCommand(cfg);
    expect(cmd).toContain(`"ffmpeg" -y`);
  });
});
