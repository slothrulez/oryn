import { describe, it, expect } from "vitest";
import { escapeSsml, FREE_TTS_VOICES, DEFAULT_FREE_VOICE } from "@/lib/edge-tts";

describe("escapeSsml (SSML special-character escaping)", () => {
  it("escapes all 5 XML special characters", () => {
    expect(escapeSsml(`a & b < c > d " e ' f`)).toBe(
      "a &amp; b &lt; c &gt; d &quot; e &apos; f"
    );
  });
  it("& must be escaped first to avoid double escaping", () => {
    // if order is wrong (< escaped before &), &lt; would be double-escaped to &amp;lt;
    expect(escapeSsml("<")).toBe("&lt;");
    expect(escapeSsml("&lt;")).toBe("&amp;lt;");
  });
  it("plain text is unaffected", () => {
    expect(escapeSsml("slow down and enjoy the moment")).toBe("slow down and enjoy the moment");
  });
  it("empty string returns empty string", () => {
    expect(escapeSsml("")).toBe("");
  });
});

describe("free voice list", () => {
  it("the default voice is in the list", () => {
    expect(FREE_TTS_VOICES.some((v) => v.value === DEFAULT_FREE_VOICE)).toBe(true);
  });
  it("every voice has a valid Edge short name + gender + language (value matches the lang prefix)", () => {
    for (const v of FREE_TTS_VOICES) {
      expect(v.value).toMatch(/^[a-z]{2}-[A-Z]{2}-.+Neural$/); // language-region-nameNeural
      expect(["female", "male"]).toContain(v.gender);
      expect(v.label.length).toBeGreaterThan(0);
      expect(v.value.startsWith(v.lang)).toBe(true);
    }
  });
  it("English voices only", () => {
    const langs = new Set(FREE_TTS_VOICES.map((v) => v.lang));
    expect(langs.has("en-US")).toBe(true); // primary language for overseas distribution
    expect([...langs].every((l) => l.startsWith("en-"))).toBe(true); // English-only voices
  });
  it("the default is the English narrator Aria", () => {
    expect(DEFAULT_FREE_VOICE).toBe("en-US-AvaNeural");
  });
});

describe("parseWordBoundaryFrame (word-boundary events → second timestamps)", () => {
  it("parses WordBoundary entries (100ns ticks → seconds)", async () => {
    const { parseWordBoundaryFrame } = await import("@/lib/edge-tts");
    const payload = JSON.stringify({
      Metadata: [
        { Type: "WordBoundary", Data: { Offset: 10_000_000, Duration: 5_000_000, text: { Text: "Hi" } } },
        { Type: "SentenceBoundary", Data: { Offset: 0, Duration: 1, text: { Text: "ignore" } } },
        { Type: "WordBoundary", Data: { Offset: 16_000_000, Duration: 4_000_000, text: { Text: "world" } } },
      ],
    });
    expect(parseWordBoundaryFrame(payload)).toEqual([
      { text: "Hi", startSec: 1, endSec: 1.5 },
      { text: "world", startSec: 1.6, endSec: 2 },
    ]);
  });

  it("bad JSON / missing fields → empty array, no throw", async () => {
    const { parseWordBoundaryFrame } = await import("@/lib/edge-tts");
    expect(parseWordBoundaryFrame("not json")).toEqual([]);
    expect(parseWordBoundaryFrame('{"Metadata":[{"Type":"WordBoundary","Data":{"text":{"Text":"no time"}}}]}')).toEqual([]);
  });
});

describe("isRetryableTTSError (deterministic failures are not retried, transient ones are)", () => {
  it("401/403/422/404/400 → no retry; 408/429/5xx/no status → retry", async () => {
    const { isRetryableTTSError } = await import("@/lib/tts");
    expect(isRetryableTTSError(new Error("TTS request failed: 401 Unauthorized - bad key"))).toBe(false);
    expect(isRetryableTTSError(new Error("Atlas TTS submit failed: 403 - forbidden"))).toBe(false);
    expect(isRetryableTTSError(new Error("Nova TTS request failed: 422 - bad voice"))).toBe(false);
    expect(isRetryableTTSError(new Error("TTS request failed: 429 Too Many Requests"))).toBe(true);
    expect(isRetryableTTSError(new Error("fal TTS submit failed: 503 - upstream"))).toBe(true);
    expect(isRetryableTTSError(new Error("fetch failed"))).toBe(true);
    expect(isRetryableTTSError(new Error("Atlas TTS polling timed out"))).toBe(true);
  });
});
