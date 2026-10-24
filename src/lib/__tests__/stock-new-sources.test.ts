import { describe, it, expect } from "vitest";
import { STOCK_SOURCES } from "@/lib/providers/stock-types";
import { searchStock } from "@/lib/providers/stock-registry";
import { toCoverrCandidate, type CoverrVideo } from "@/lib/providers/coverr";
import {
  isCommerceSafeCcUrl,
  jamendoLicenseName,
  toJamendoCandidate,
  type JamendoTrack,
} from "@/lib/providers/jamendo";
import {
  freesoundLicenseInfo,
  toFreesoundCandidate,
  type FreesoundSound,
} from "@/lib/providers/freesound";
import { classifyLicense } from "@/lib/asset-credits";

describe("new stock source registration", () => {
  it("coverr/jamendo/freesound are in the source list, each with envKey and signupUrl", () => {
    for (const id of ["coverr", "jamendo", "freesound"] as const) {
      const meta = STOCK_SOURCES.find((s) => s.id === id);
      expect(meta, id).toBeDefined();
      expect(meta!.keyless).toBe(false);
      expect(meta!.envKey).toBeTruthy();
      expect(meta!.signupUrl).toBeTruthy();
    }
  });

  it("media type matching: coverr is video only, jamendo/freesound audio only (silently empty on mismatch)", async () => {
    expect(await searchStock("coverr", "x", { mediaType: "audio", apiKeys: { coverr: "k" } })).toEqual([]);
    expect(await searchStock("jamendo", "x", { mediaType: "video", apiKeys: { jamendo: "k" } })).toEqual([]);
    expect(await searchStock("freesound", "x", { mediaType: "image", apiKeys: { freesound: "k" } })).toEqual([]);
  });
});

describe("Coverr normalization", () => {
  const base: CoverrVideo = {
    id: "abc123",
    title: "Pouring coffee",
    duration: 12.5,
    max_width: 1080,
    max_height: 1920,
    poster: "https://storage.coverr.co/p/abc123",
    urls: { mp4: "https://cdn/x.mp4", mp4_download: "https://cdn/x_dl.mp4" },
  };

  it("prefers the download link, credits Coverr, requiresAttribution=true", () => {
    const c = toCoverrCandidate(base)!;
    expect(c.downloadUrl).toBe("https://cdn/x_dl.mp4");
    expect(c.source).toBe("coverr");
    expect(c.requiresAttribution).toBe(true);
    expect(c.license).toBe("Coverr");
    expect(c.width).toBe(1080);
    expect(c.height).toBe(1920);
  });

  it("no downloadable URL returns null", () => {
    expect(toCoverrCandidate({ id: "no-urls" })).toBeNull();
  });
});

describe("Jamendo license filtering (commerce-safe = plain CC-BY)", () => {
  it("isCommerceSafeCcUrl: BY passes; NC/ND/SA/unknown are all rejected", () => {
    expect(isCommerceSafeCcUrl("http://creativecommons.org/licenses/by/3.0/")).toBe(true);
    expect(isCommerceSafeCcUrl("https://creativecommons.org/licenses/by/4.0/")).toBe(true);
    expect(isCommerceSafeCcUrl("http://creativecommons.org/licenses/by-nc/3.0/")).toBe(false);
    expect(isCommerceSafeCcUrl("http://creativecommons.org/licenses/by-nd/3.0/")).toBe(false);
    expect(isCommerceSafeCcUrl("http://creativecommons.org/licenses/by-sa/3.0/")).toBe(false);
    expect(isCommerceSafeCcUrl(undefined)).toBe(false);
  });

  it("jamendoLicenseName parses the version number", () => {
    expect(jamendoLicenseName("http://creativecommons.org/licenses/by/3.0/")).toBe("CC BY 3.0");
    expect(jamendoLicenseName("bad")).toBe("unknown");
  });

  it("toJamendoCandidate: NC tracks are dropped, BY tracks carry attribution text", () => {
    const byTrack: JamendoTrack = {
      id: "t1",
      name: "Sunrise",
      artist_name: "Alice",
      artist_id: "a9",
      duration: 120,
      audio: "https://stream/t1.mp3",
      audiodownload: "https://dl/t1.mp3",
      audiodownload_allowed: true,
      license_ccurl: "http://creativecommons.org/licenses/by/3.0/",
      shareurl: "https://www.jamendo.com/track/t1",
    };
    const c = toJamendoCandidate(byTrack)!;
    expect(c.downloadUrl).toBe("https://dl/t1.mp3");
    expect(c.requiresAttribution).toBe(true);
    expect(c.attributionText).toContain("Alice");
    expect(c.authorUrl).toContain("/artist/a9");

    const ncTrack = { ...byTrack, license_ccurl: "http://creativecommons.org/licenses/by-nc/3.0/" };
    expect(toJamendoCandidate(ncTrack)).toBeNull();
  });

  it("falls back to the stream URL when downloads are not allowed", () => {
    const t: JamendoTrack = {
      id: "t2",
      name: "Dusk",
      audio: "https://stream/t2.mp3",
      audiodownload: "https://dl/t2.mp3",
      audiodownload_allowed: false,
      license_ccurl: "http://creativecommons.org/licenses/by/3.0/",
    };
    expect(toJamendoCandidate(t)!.downloadUrl).toBe("https://stream/t2.mp3");
  });
});

describe("Freesound license filtering", () => {
  it("freesoundLicenseInfo: CC0 needs no credit, CC-BY needs credit, the rest are rejected", () => {
    expect(freesoundLicenseInfo("http://creativecommons.org/publicdomain/zero/1.0/")).toEqual({
      name: "CC0",
      commerceSafe: true,
      requiresAttribution: false,
    });
    expect(freesoundLicenseInfo("http://creativecommons.org/licenses/by/4.0/").requiresAttribution).toBe(true);
    expect(freesoundLicenseInfo("http://creativecommons.org/licenses/by-nc/4.0/").commerceSafe).toBe(false);
    expect(freesoundLicenseInfo(undefined).commerceSafe).toBe(false);
  });

  it("toFreesoundCandidate: takes the HQ preview direct link; no preview or NC returns null", () => {
    const s: FreesoundSound = {
      id: 7,
      name: "box open",
      username: "bob",
      duration: 2.1,
      license: "http://creativecommons.org/publicdomain/zero/1.0/",
      url: "https://freesound.org/s/7/",
      previews: { "preview-hq-mp3": "https://cdn/7-hq.mp3", "preview-lq-mp3": "https://cdn/7-lq.mp3" },
    };
    const c = toFreesoundCandidate(s)!;
    expect(c.downloadUrl).toBe("https://cdn/7-hq.mp3");
    expect(c.requiresAttribution).toBe(false);

    expect(toFreesoundCandidate({ ...s, previews: undefined })).toBeNull();
    expect(
      toFreesoundCandidate({ ...s, license: "http://creativecommons.org/licenses/by-nc/4.0/" })
    ).toBeNull();
  });
});

describe("license manifest linkage", () => {
  it("classifyLicense: Coverr is recorded as attribution-required and commercially usable", () => {
    expect(classifyLicense("Coverr")).toEqual({ risk: "attribution", requiresAttribution: true });
  });
});
