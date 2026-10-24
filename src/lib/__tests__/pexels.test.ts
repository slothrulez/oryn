import { describe, it, expect } from "vitest";
import {
  pickBestVideoFile,
  toVideoCandidate,
  filterByDuration,
  orientationOf,
  inferExtension,
  pickPhotoSrc,
  toPhotoCandidate,
  type PexelsVideo,
  type PexelsPhoto,
} from "@/lib/providers/pexels";

// Real Pexels video response (sampled 2026-06, portrait coffee footage) used to drive pure-function tests
const REAL_VIDEO: PexelsVideo = {
  id: 10743047,
  width: 2100,
  height: 3734,
  duration: 6,
  url: "https://www.pexels.com/video/fresh-coffee-in-autumn-ambiance-10743047/",
  image: "https://images.pexels.com/videos/10743047/preview.jpeg",
  user: { id: 669175, name: "Kateryna Hnidash", url: "https://www.pexels.com/@katerynahnidash" },
  video_files: [
    { id: 4746027, quality: "hd", file_type: "video/mp4", width: 720, height: 1280, fps: 25, link: "https://videos.pexels.com/video-files/10743047/10743047-hd_720_1280_25fps.mp4", size: 1969262 },
    { id: 4746028, quality: "hd", file_type: "video/mp4", width: 1080, height: 1920, fps: 25, link: "https://videos.pexels.com/video-files/10743047/10743047-hd_1080_1920_25fps.mp4", size: 3639032 },
    { id: 4746029, quality: "hd", file_type: "video/mp4", width: 2100, height: 3734, fps: 25, link: "https://videos.pexels.com/video-files/10743047/10743047-hd_2100_3734_25fps.mp4", size: 16272262 },
    { id: 4746030, quality: "sd", file_type: "video/mp4", width: 540, height: 960, fps: 25, link: "https://videos.pexels.com/video-files/10743047/10743047-sd_540_960_25fps.mp4", size: 1188037 },
    { id: 4746031, quality: "hd", file_type: "video/mp4", width: 1440, height: 2560, fps: 25, link: "https://videos.pexels.com/video-files/10743047/10743047-hd_1440_2560_25fps.mp4", size: 9019185 },
    { id: 4746032, quality: "sd", file_type: "video/mp4", width: 360, height: 640, fps: 25, link: "https://videos.pexels.com/video-files/10743047/10743047-sd_360_640_25fps.mp4", size: 425950 },
  ],
};

describe("orientationOf", () => {
  it("determines orientation from width and height", () => {
    expect(orientationOf(540, 960)).toBe("portrait");
    expect(orientationOf(1920, 1080)).toBe("landscape");
    expect(orientationOf(100, 100)).toBe("square");
  });
});

describe("pickBestVideoFile", () => {
  it("portrait with minShortSide=720 picks the smallest passing file = 720x1280", () => {
    const f = pickBestVideoFile(REAL_VIDEO.video_files, { orientation: "portrait", minShortSide: 720 });
    expect(f?.width).toBe(720);
    expect(f?.height).toBe(1280);
  });

  it("raising the threshold to 1080 moves up to 1080x1920", () => {
    const f = pickBestVideoFile(REAL_VIDEO.video_files, { orientation: "portrait", minShortSide: 1080 });
    expect(f?.height).toBe(1920);
  });

  it("when the threshold is so high nothing passes, falls back to the highest resolution", () => {
    const f = pickBestVideoFile(REAL_VIDEO.video_files, { orientation: "portrait", minShortSide: 9999 });
    expect(f?.height).toBe(3734); // 2100x3734 has the largest short side
  });

  it("falls back to the whole pool only when the landscape orientation has no match", () => {
    const f = pickBestVideoFile(REAL_VIDEO.video_files, { orientation: "landscape", minShortSide: 720 });
    // all files are portrait; after fallback still picks smallest file with short side >= 720
    expect(f).not.toBeNull();
  });

  it("no mp4 files returns null", () => {
    expect(pickBestVideoFile([], {})).toBeNull();
  });
});

describe("toVideoCandidate", () => {
  it("normalization keeps compliance attribution fields (author/source page/license)", () => {
    const c = toVideoCandidate(REAL_VIDEO, { orientation: "portrait", minShortSide: 720 });
    expect(c).not.toBeNull();
    expect(c!.author).toBe("Kateryna Hnidash");
    expect(c!.pageUrl).toContain("pexels.com");
    expect(c!.license).toBe("Pexels");
    expect(c!.durationSec).toBe(6);
    expect(c!.downloadUrl).toContain(".mp4");
    expect(c!.mediaType).toBe("video");
  });
});

describe("filterByDuration", () => {
  it("durations inside the range are kept, outside are dropped", () => {
    const c = toVideoCandidate(REAL_VIDEO, {})!;
    expect(filterByDuration([c], { minSec: 3, maxSec: 10 })).toHaveLength(1);
    expect(filterByDuration([c], { minSec: 8 })).toHaveLength(0);
  });
});

describe("inferExtension", () => {
  it("infers the extension from the direct link", () => {
    expect(inferExtension("https://x/a-hd_540_960.mp4")).toBe("mp4");
    expect(inferExtension("https://x/a.jpg")).toBe("jpg");
  });
  it("prefers content-type", () => {
    expect(inferExtension("https://x/noext", "image/png")).toBe("png");
    expect(inferExtension("https://x/a.mp4", "video/webm")).toBe("webm");
  });
});

describe("image candidates", () => {
  const PHOTO: PexelsPhoto = {
    id: 1,
    width: 4000,
    height: 6000,
    url: "https://www.pexels.com/photo/x-1/",
    photographer: "Jane",
    photographer_url: "https://www.pexels.com/@jane",
    alt: "coffee",
    src: {
      original: "https://images.pexels.com/photos/1/orig.jpg",
      large2x: "https://images.pexels.com/photos/1/l2x.jpg",
      large: "https://images.pexels.com/photos/1/l.jpg",
      medium: "https://images.pexels.com/photos/1/m.jpg",
      portrait: "https://images.pexels.com/photos/1/portrait.jpg",
      landscape: "https://images.pexels.com/photos/1/landscape.jpg",
      tiny: "https://images.pexels.com/photos/1/tiny.jpg",
    },
  };

  it("portrait picks the portrait source and keeps the author credit", () => {
    expect(pickPhotoSrc(PHOTO, "portrait")).toContain("portrait.jpg");
    const c = toPhotoCandidate(PHOTO, "portrait");
    expect(c.author).toBe("Jane");
    expect(c.mediaType).toBe("image");
    expect(c.license).toBe("Pexels");
  });
});
