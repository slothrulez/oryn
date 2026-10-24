import { describe, it, expect } from "vitest";
import { pickNasaVideoUrl, pickNasaImageUrl } from "@/lib/providers/nasa";
import { pickArchiveFile, archiveDownloadUrl } from "@/lib/providers/archive";

describe("pickNasaVideoUrl", () => {
  const urls = [
    "http://images-assets.nasa.gov/video/X/X~orig.mov",
    "http://images-assets.nasa.gov/video/X/X.vtt",
    "http://images-assets.nasa.gov/video/X/X~medium.mp4",
    "http://images-assets.nasa.gov/video/X/X~mobile.mp4",
  ];
  it("picks ~medium.mp4 and upgrades to https, skipping .mov/.vtt", () => {
    expect(pickNasaVideoUrl(urls)).toBe("https://images-assets.nasa.gov/video/X/X~medium.mp4");
  });
  it("falls back to mobile when there is no medium", () => {
    expect(pickNasaVideoUrl(["http://h/X~mobile.mp4"])).toBe("https://h/X~mobile.mp4");
  });
  it("no mp4 → null", () => {
    expect(pickNasaVideoUrl(["http://h/X~orig.mov"])).toBeNull();
  });
});

describe("pickNasaImageUrl", () => {
  it("prefers the ~large image and upgrades to https", () => {
    expect(pickNasaImageUrl(["http://h/X~thumb.jpg", "http://h/X~large.jpg"])).toBe("https://h/X~large.jpg");
  });
});

describe("pickArchiveFile", () => {
  const files = [
    { name: "X.mp4", format: "h.264", width: 640, height: 480 },
    { name: "X.gif", format: "Animated GIF" },
    { name: "__ia_thumb.jpg", format: "Thumbnail" },
    { name: "X.jpg", format: "JPEG", width: 800, height: 600 },
  ];
  it("for video, picks the mp4 with width and height", () => {
    expect(pickArchiveFile(files, "video")?.name).toBe("X.mp4");
  });
  it("for images, skips thumbnails and picks the real image", () => {
    expect(pickArchiveFile(files, "image")?.name).toBe("X.jpg");
  });
  it("no match → null", () => {
    expect(pickArchiveFile([{ name: "X.txt" }], "video")).toBeNull();
  });
});

describe("archiveDownloadUrl", () => {
  it("file names are encoded per segment, keeping path separators", () => {
    expect(archiveDownloadUrl("my item", "a b/c.mp4")).toBe("https://archive.org/download/my%20item/a%20b/c.mp4");
  });
});
