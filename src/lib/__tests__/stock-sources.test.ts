import { describe, it, expect } from "vitest";
import {
  toOpenverseImageCandidate,
  toOpenverseAudioCandidate,
  ccRequiresAttribution,
  composeLicense,
  type OpenverseImage,
  type OpenverseAudio,
} from "@/lib/providers/openverse";
import {
  pickPixabayVideoFile,
  toPixabayVideoCandidate,
  toPixabayImageCandidate,
  pixabayAuthorUrl,
  type PixabayVideoHit,
  type PixabayImageHit,
} from "@/lib/providers/pixabay";
import {
  resolveSourceKey,
  isSourceAvailable,
  getAvailableSources,
  rankStockCandidates,
} from "@/lib/providers/stock-registry";
import { inferExtension, type StockCandidate } from "@/lib/providers/stock-types";
import {
  stripHtml,
  wikimediaRequiresAttribution,
  derivativeHeight,
  pickWikimediaVideoSrc,
  toWikimediaCandidate,
  type CommonsPage,
} from "@/lib/providers/wikimedia";
import { STOCK_SOURCES } from "@/lib/providers/stock-types";

// ==================== Openverse ====================

describe("Openverse normalization", () => {
  const IMG: OpenverseImage = {
    id: "abc-123",
    title: "Coffee",
    url: "https://live.staticflickr.com/x/coffee.jpg",
    thumbnail: "https://api.openverse.org/v1/images/abc-123/thumb/",
    creator: "Jane Doe",
    creator_url: "https://flickr.com/jane",
    foreign_landing_url: "https://flickr.com/photos/jane/123",
    license: "by",
    license_version: "2.0",
    license_url: "https://creativecommons.org/licenses/by/2.0/",
    attribution: '"Coffee" by Jane Doe is licensed under CC BY 2.0.',
    width: 1920,
    height: 1080,
  };

  it("image field mapping + combined license + ready-made attribution text", () => {
    const c = toOpenverseImageCandidate(IMG)!;
    expect(c.source).toBe("openverse");
    expect(c.mediaType).toBe("image");
    expect(c.downloadUrl).toContain("coffee.jpg");
    expect(c.pageUrl).toContain("flickr.com/photos");
    expect(c.author).toBe("Jane Doe");
    expect(c.license).toBe("by-2.0");
    expect(c.licenseUrl).toContain("creativecommons.org");
    expect(c.attributionText).toContain("CC BY 2.0");
    expect(c.requiresAttribution).toBe(true);
  });

  it("CC0/PDM do not require credit; the BY family does", () => {
    expect(ccRequiresAttribution("cc0")).toBe(false);
    expect(ccRequiresAttribution("pdm")).toBe(false);
    expect(ccRequiresAttribution("by")).toBe(true);
    expect(ccRequiresAttribution("by-sa")).toBe(true);
  });

  it("composeLicense uses only license when there is no version", () => {
    expect(composeLicense("cc0")).toBe("cc0");
    expect(composeLicense("by", "4.0")).toBe("by-4.0");
  });

  it("audio duration ms → seconds; alt_files takes the highest bitrate", () => {
    const AUD: OpenverseAudio = {
      id: "a1",
      url: "https://x/low.mp3",
      license: "cc0",
      duration: 125000, // 125s
      alt_files: [
        { url: "https://x/lq.mp3", bit_rate: 128000 },
        { url: "https://x/hq.mp3", bit_rate: 320000 },
      ],
    };
    const c = toOpenverseAudioCandidate(AUD)!;
    expect(c.mediaType).toBe("audio");
    expect(c.durationSec).toBe(125);
    expect(c.downloadUrl).toContain("hq.mp3");
    expect(c.requiresAttribution).toBe(false);
  });
});

// ==================== Pixabay ====================

describe("Pixabay normalization", () => {
  const VIDEO: PixabayVideoHit = {
    id: 12345,
    pageURL: "https://pixabay.com/videos/id-12345/",
    tags: "coffee, morning, cafe",
    duration: 12,
    user: "maxlkt",
    user_id: 8989,
    videos: {
      large: { url: "", width: 0, height: 0, size: 0 }, // common empty slot
      medium: { url: "https://cdn.pixabay.com/m.mp4", width: 1920, height: 1080, size: 5_000_000, thumbnail: "https://x/m.jpg" },
      small: { url: "https://cdn.pixabay.com/s.mp4", width: 1280, height: 720, size: 2_000_000, thumbnail: "https://x/s.jpg" },
      tiny: { url: "https://cdn.pixabay.com/t.mp4", width: 960, height: 540, size: 800_000, thumbnail: "https://x/t.jpg" },
    },
  };

  it("picks quality: skips empty tiers; minShortSide=720 takes the smallest passing size (small 720)", () => {
    const f = pickPixabayVideoFile(VIDEO.videos, { minShortSide: 720 });
    expect(f?.height).toBe(720);
  });

  it("threshold 1080 moves up to medium", () => {
    const f = pickPixabayVideoFile(VIDEO.videos, { minShortSide: 1080 });
    expect(f?.height).toBe(1080);
  });

  it("too high a threshold falls back to the highest resolution (medium 1080)", () => {
    const f = pickPixabayVideoFile(VIDEO.videos, { minShortSide: 9999 });
    expect(f?.height).toBe(1080);
  });

  it("video candidates: downloadUrl appends ?download=1, author page joined, duration kept", () => {
    const c = toPixabayVideoCandidate(VIDEO, { minShortSide: 720 })!;
    expect(c.source).toBe("pixabay");
    expect(c.downloadUrl).toContain("?download=1");
    expect(c.authorUrl).toBe("https://pixabay.com/users/maxlkt-8989/");
    expect(c.durationSec).toBe(12);
    expect(c.requiresAttribution).toBe(false);
  });

  it("image candidates: largeImageURL for download, webformatURL for preview", () => {
    const IMG: PixabayImageHit = {
      id: 99,
      pageURL: "https://pixabay.com/photos/id-99/",
      tags: "tea",
      previewURL: "https://x/prev.jpg",
      webformatURL: "https://x/web_640.jpg",
      largeImageURL: "https://x/large_1280.jpg",
      imageWidth: 4000,
      imageHeight: 3000,
      user: "alice",
      user_id: 1,
    };
    const c = toPixabayImageCandidate(IMG);
    expect(c.downloadUrl).toContain("large_1280");
    expect(c.previewImage).toContain("web_640");
    expect(c.width).toBe(4000);
  });

  it("pixabayAuthorUrl joining", () => {
    expect(pixabayAuthorUrl("bob", 42)).toBe("https://pixabay.com/users/bob-42/");
  });
});

// ==================== Registry ====================

// ==================== Wikimedia Commons ====================

describe("Wikimedia normalization", () => {
  it("stripHtml removes tags and collapses whitespace", () => {
    expect(stripHtml('<a href="x">Jane  Doe</a>')).toBe("Jane Doe");
    expect(stripHtml(undefined)).toBe("");
  });

  it("wikimediaRequiresAttribution: PD/CC0 need no credit, the BY family does", () => {
    expect(wikimediaRequiresAttribution("Public domain")).toBe(false);
    expect(wikimediaRequiresAttribution("CC0")).toBe(false);
    expect(wikimediaRequiresAttribution("CC BY-SA 4.0")).toBe(true);
    expect(wikimediaRequiresAttribution("CC BY 3.0")).toBe(true);
  });

  it("video files normalize into video candidates with duration/license/attribution link", () => {
    const page: CommonsPage = {
      pageid: 123,
      title: "File:Ocean waves.webm",
      imageinfo: [
        {
          url: "https://upload.wikimedia.org/x/Ocean_waves.webm",
          thumburl: "https://upload.wikimedia.org/x/thumb.jpg",
          width: 1280,
          height: 720,
          mime: "video/webm",
          duration: 12.6,
          user: "Uploader",
          extmetadata: {
            LicenseShortName: { value: "CC BY-SA 4.0" },
            LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0" },
            Artist: { value: '<a href="x">Jane Doe</a>' },
          },
        },
      ],
    };
    const c = toWikimediaCandidate(page, "video")!;
    expect(c.source).toBe("wikimedia");
    expect(c.mediaType).toBe("video");
    expect(c.downloadUrl).toBe("https://upload.wikimedia.org/x/Ocean_waves.webm");
    expect(c.durationSec).toBe(13); // 12.6 → rounded
    expect(c.author).toBe("Jane Doe");
    expect(c.requiresAttribution).toBe(true);
    expect(c.previewImage).toBe("https://upload.wikimedia.org/x/thumb.jpg");
    expect(c.pageUrl).toContain("commons.wikimedia.org/wiki/");
  });

  it("no imageinfo/direct link → returns null (filtered)", () => {
    expect(toWikimediaCandidate({ pageid: 1, title: "File:x" }, "image")).toBeNull();
  });

  it("audio files → mediaType audio + direct download (a keyless background music source)", () => {
    const page: CommonsPage = {
      pageid: 7,
      title: "File:Song.opus",
      imageinfo: [
        {
          url: "https://upload.wikimedia.org/x/Song.opus",
          mime: "audio/ogg",
          duration: 60,
          extmetadata: { LicenseShortName: { value: "CC BY 3.0" }, Artist: { value: "PeriTune" } },
        },
      ],
    };
    const c = toWikimediaCandidate(page, "audio")!;
    expect(c.mediaType).toBe("audio");
    expect(c.downloadUrl).toBe("https://upload.wikimedia.org/x/Song.opus"); // direct link, no transcoding
    expect(c.author).toBe("PeriTune");
    expect(c.durationSec).toBe(60);
  });

  it("derivativeHeight: prefers the height field, otherwise parses transcodekey", () => {
    expect(derivativeHeight({ height: 480 })).toBe(480);
    expect(derivativeHeight({ transcodekey: "480p.vp9.webm" })).toBe(480);
    expect(derivativeHeight({ type: "video/ogg" })).toBe(0);
  });

  it("pickWikimediaVideoSrc: picks the highest webm transcode ≤720p (240p+480p → 480p)", () => {
    const src = pickWikimediaVideoSrc(
      [
        { transcodekey: "video/ogg", type: "video/ogg", src: "orig.ogv", height: 1080 }, // original non-webm
        { transcodekey: "240p.vp9.webm", src: "v240.webm" },
        { transcodekey: "480p.vp9.webm", src: "v480.webm" },
      ],
      "orig.ogv",
    );
    expect(src).toBe("v480.webm");
  });

  it("pickWikimediaVideoSrc: all >720 → takes the smallest webm", () => {
    const src = pickWikimediaVideoSrc(
      [
        { transcodekey: "1080p.vp9.webm", src: "v1080.webm" },
        { transcodekey: "2160p.vp9.webm", src: "v2160.webm" },
      ],
      "orig.ogv",
    );
    expect(src).toBe("v1080.webm");
  });

  it("pickWikimediaVideoSrc: no webm transcode → falls back to the original direct link", () => {
    expect(pickWikimediaVideoSrc([{ transcodekey: "144p.mjpeg.mov", src: "x.mov" }], "orig.ogv")).toBe("orig.ogv");
    expect(pickWikimediaVideoSrc(undefined, "orig.ogv")).toBe("orig.ogv");
  });

  it("toWikimediaCandidate: videos with derivatives → downloadUrl takes the 480p webm transcode", () => {
    const page: CommonsPage = {
      pageid: 9,
      title: "File:Clip.ogv",
      videoinfo: [
        {
          url: "https://upload.wikimedia.org/x/Clip.ogv",
          mime: "application/ogg",
          duration: 10,
          extmetadata: { LicenseShortName: { value: "CC0" } },
          derivatives: [
            { transcodekey: "240p.vp9.webm", src: "https://up/Clip.240p.webm" },
            { transcodekey: "480p.vp9.webm", src: "https://up/Clip.480p.webm" },
          ],
        },
      ],
    };
    const c = toWikimediaCandidate(page, "video")!;
    expect(c.mediaType).toBe("video");
    expect(c.downloadUrl).toBe("https://up/Clip.480p.webm"); // use transcoded version instead of .ogv original
    expect(c.requiresAttribution).toBe(false); // CC0
  });
});

describe("multi-source registry", () => {
  it("STOCK_SOURCES includes openverse(keyless)/wikimedia(keyless, video)/pexels/pixabay", () => {
    const ids = STOCK_SOURCES.map((s) => s.id);
    expect(ids).toContain("openverse");
    expect(ids).toContain("pexels");
    expect(ids).toContain("pixabay");
    expect(ids).toContain("wikimedia");
    expect(STOCK_SOURCES.find((s) => s.id === "openverse")?.keyless).toBe(true);
    const wm = STOCK_SOURCES.find((s) => s.id === "wikimedia")!;
    expect(wm.keyless).toBe(true); // no API key required
    expect(wm.mediaTypes).toContain("video"); // only keyless video source
    expect(wm.mediaTypes).toContain("audio"); // keyless BGM source
  });

  it("wikimedia works without a key (keyless)", () => {
    const wm = STOCK_SOURCES.find((s) => s.id === "wikimedia")!;
    expect(isSourceAvailable(wm, {})).toBe(true);
  });

  it("resolveSourceKey prefers apiKeys, otherwise empty", () => {
    expect(resolveSourceKey("pexels", { pexels: "k1" })).toBe("k1");
    expect(resolveSourceKey("pixabay", {})).toBe("");
  });

  it("openverse is always available (keyless); pexels is unavailable without a key and available with one", () => {
    const ov = STOCK_SOURCES.find((s) => s.id === "openverse")!;
    const px = STOCK_SOURCES.find((s) => s.id === "pexels")!;
    expect(isSourceAvailable(ov)).toBe(true);
    expect(isSourceAvailable(px, {})).toBe(false);
    expect(isSourceAvailable(px, { pexels: "k" })).toBe(true);
  });

  it("getAvailableSources includes at least openverse with no keys at all", () => {
    const avail = getAvailableSources({}).map((s) => s.id);
    expect(avail).toContain("openverse");
  });
});

// ==================== Review Fix Regressions ====================

const cand = (over: Partial<StockCandidate>): StockCandidate => ({
  source: "openverse",
  mediaType: "image",
  id: "1",
  downloadUrl: "u",
  pageUrl: "p",
  author: "a",
  authorUrl: "au",
  license: "cc0",
  ...over,
});

describe("rankStockCandidates (aggregate ranking)", () => {
  it("when video is requested real videos rank above high-res Openverse images (fixes 'asked for video, got a still')", () => {
    const ranked = rankStockCandidates(
      [
        cand({ source: "openverse", mediaType: "image", id: "img", width: 4000, height: 6000 }),
        cand({ source: "pexels", mediaType: "video", id: "vid", width: 720, height: 1280 }),
      ],
      "video",
      "portrait",
    );
    expect(ranked[0].id).toBe("vid");
  });

  it("when images are requested portrait assets beat landscape (orientation match, less portrait cropping/letterboxing)", () => {
    const ranked = rankStockCandidates(
      [
        cand({ id: "land", width: 1920, height: 1080 }),
        cand({ id: "port", width: 1080, height: 1920 }),
      ],
      "image",
      "portrait",
    );
    expect(ranked[0].id).toBe("port");
  });

  it("local own assets (same type) beat sized free sources — uploads are meant to be used", () => {
    const ranked = rankStockCandidates(
      [
        cand({ source: "wikimedia", mediaType: "video", id: "wiki", width: 1080, height: 1920 }),
        cand({ source: "local", mediaType: "video", id: "mine" }), // local has no dimensions but should still rank first
      ],
      "video",
      "portrait",
    );
    expect(ranked[0].id).toBe("mine");
  });
});

describe("Wikimedia skips videos without webm transcodes", () => {
  it("video falling back to .ogv (no webm transcode) → returns null (unplayable assets are not chosen)", () => {
    const page: CommonsPage = {
      pageid: 5,
      title: "File:Old.ogv",
      videoinfo: [
        {
          url: "https://up/Old.ogv",
          mime: "application/ogg",
          derivatives: [{ transcodekey: "144p.mjpeg.mov", src: "https://up/Old.144p.mov" }],
        },
      ],
    };
    expect(toWikimediaCandidate(page, "video")).toBeNull();
  });
});

describe("inferExtension gives defaults by media type when there is no extension", () => {
  it("content-type first, then the URL extension", () => {
    expect(inferExtension("https://x/file", "image/png")).toBe("png");
    expect(inferExtension("https://x/a.webm?v=1")).toBe("webm");
  });
  it("nothing recognized → images jpg / audio mp3 / video mp4 (no longer always mp4)", () => {
    expect(inferExtension("https://x/noext", null, "image")).toBe("jpg");
    expect(inferExtension("https://x/noext", null, "audio")).toBe("mp3");
    expect(inferExtension("https://x/noext", null, "video")).toBe("mp4");
  });
});

describe("Openverse without a direct link returns null", () => {
  it("images/audio missing url → null (filtered from search results, no undefined download crashing the shot)", () => {
    expect(toOpenverseImageCandidate({ id: "x", url: "", license: "cc0" } as OpenverseImage)).toBeNull();
    expect(toOpenverseAudioCandidate({ id: "x", url: "", license: "cc0" } as OpenverseAudio)).toBeNull();
  });
});
