import { describe, it, expect } from "vitest";
import { resolveUploadFilePath } from "@/lib/remote-image";
import { escapeSsml } from "@/lib/edge-tts";

// ==================== path traversal protection (toRemoteUsableImage in /api/ai/image|video) ====================

describe("resolveUploadFilePath path traversal protection", () => {
  it("normal /api/files paths resolve inside the uploads directory", () => {
    const p = resolveUploadFilePath("/api/files/abc.png");
    expect(p).toBeTruthy();
    expect(p!.includes("uploads")).toBe(true);
    expect(p!.endsWith(`abc.png`)).toBe(true);
  });

  it("path traversal with ../ is rejected (returns null, no out-of-tree disk reads)", () => {
    expect(resolveUploadFilePath("/api/files/../../../../etc/passwd")).toBeNull();
    expect(resolveUploadFilePath("/api/files/../config")).toBeNull();
    expect(resolveUploadFilePath("/api/files/sub/../../../secret")).toBeNull();
  });

  it("non-/api/files paths return null (the caller passes them through as-is)", () => {
    expect(resolveUploadFilePath("https://example.com/x.png")).toBeNull();
    expect(resolveUploadFilePath("random-string")).toBeNull();
  });
});

// ==================== SSML attribute injection protection (fallback escaping for edge-tts voice/pitch/rate) ====================

describe("escapeSsml guards against SSML attribute injection", () => {
  it("escapes single quotes/angle brackets — voice/rate sit in single-quoted attributes, and an unescaped ' could break out and inject", () => {
    const out = escapeSsml("x' /><voice name='evil");
    expect(out).not.toContain("'"); // single quotes must be escaped; unescaped ones can break out of the attribute and inject new elements
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(out).toContain("&apos;");
    expect(out).toContain("&lt;");
  });

  it("valid voice names have no side effects (escaping is a harmless safety net)", () => {
    expect(escapeSsml("en-US-AriaNeural")).toBe("en-US-AriaNeural");
    expect(escapeSsml("+10%")).toBe("+10%");
  });
});
