import { describe, it, expect, vi, afterEach } from "vitest";
import { AtlasCloudProvider, buildImageSizeParams } from "@/lib/providers/atlas-cloud";

/**
 * Issue #18 regressions — Atlas image models each have their own size contract.
 *
 * A user generated a 9:16 asset with openai/gpt-image-2/text-to-image; the app sent the
 * raw default size "1080x1920", which gpt-image-2 rejects server-side ("size must be
 * multiples of 16") AFTER the task was billed. The same raw passthrough also broke the
 * other catalog models: pixel v5 only accepts `W*H` presets, and nano-banana has no
 * size field at all (aspect_ratio + resolution instead).
 */

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("buildImageSizeParams: gpt-image-2 (issue #18 main case)", () => {
  it("1080x1920 (default 9:16) maps to the exact-ratio, 16-divisible official size 1152x2048", () => {
    expect(buildImageSizeParams("openai/gpt-image-2/text-to-image", 1080, 1920)).toEqual({
      size: "1152x2048",
    });
  });

  it("landscape 1920x1080 maps to 2048x1152 (16:9 hits the same trap)", () => {
    expect(buildImageSizeParams("openai/gpt-image-2/text-to-image", 1920, 1080)).toEqual({
      size: "2048x1152",
    });
  });

  it("edit model (gpt-image-2/edit) follows the same rule: 3:4 keeps the exact ratio (1104x1472)", () => {
    expect(buildImageSizeParams("openai/gpt-image-2/edit", 1080, 1440)).toEqual({
      size: "1104x1472",
    });
  });

  it("already 16-divisible same-ratio sizes stay as-is (720x1280)", () => {
    expect(buildImageSizeParams("openai/gpt-image-2/text-to-image", 720, 1280)).toEqual({
      size: "720x1280",
    });
  });

  it("sizes that are already multiples of 16 stay as-is", () => {
    expect(buildImageSizeParams("openai/gpt-image-2/text-to-image", 1024, 1024)).toEqual({
      size: "1024x1024",
    });
  });

  it("any input snaps to a 16-divisible size no larger than the 3840 cap", () => {
    for (const [w, h] of [[1080, 1920], [999, 1234], [4500, 100], [720, 1280], [17, 17], [1080, 1440], [750, 1000]]) {
      const size = buildImageSizeParams("openai/gpt-image-2/text-to-image", w, h).size!;
      const [sw, sh] = size.split("x").map(Number);
      expect(sw % 16).toBe(0);
      expect(sh % 16).toBe(0);
      expect(sw).toBeGreaterThanOrEqual(16);
      expect(sw).toBeLessThanOrEqual(3840);
      expect(sh).toBeLessThanOrEqual(3840);
    }
  });
});


describe("buildImageSizeParams: nano-banana (no size field, uses aspect_ratio+resolution)", () => {
  it("1080x1920 → aspect_ratio 9:16 + 2k, with no size field", () => {
    const params = buildImageSizeParams("google/nano-banana-2/text-to-image", 1080, 1920);
    expect(params).toEqual({ aspect_ratio: "9:16", resolution: "2k" });
    expect(params.size).toBeUndefined();
  });

  it("1024x1024 → 1:1 + 1k", () => {
    expect(buildImageSizeParams("google/nano-banana-2/text-to-image", 1024, 1024)).toEqual({
      aspect_ratio: "1:1",
      resolution: "1k",
    });
  });
});

describe("buildImageSizeParams: fallback behavior", () => {
  it("unknown/custom models keep the old WxH passthrough (no behavior change)", () => {
    expect(buildImageSizeParams("some/custom-model", 1080, 1920)).toEqual({
      size: "1080x1920",
    });
  });

  it("missing width/height returns an empty object (platform default)", () => {
    expect(buildImageSizeParams("openai/gpt-image-2/text-to-image")).toEqual({});
    expect(buildImageSizeParams("openai/gpt-image-2/text-to-image", 1080)).toEqual({});
  });
});

describe("generateImage integration: the request body actually sent (issue #18 repro path)", () => {
  /** fetch stub: capture the create-task body, then report the task completed */
  function stubAtlasFetch() {
    const bodies: Array<Record<string, unknown>> = [];
    const fakeResponse = (payload: unknown): Response =>
      ({
        ok: true,
        status: 200,
        json: async () => payload,
        text: async () => "",
      }) as unknown as Response;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        if (String(url).includes("/model/generateImage")) {
          bodies.push(JSON.parse(String(init.body)));
          return fakeResponse({ code: 200, data: { id: "task-18" } });
        }
        return fakeResponse({
          id: "task-18",
          status: "completed",
          outputs: ["https://example.com/out.png"],
          model: "openai/gpt-image-2/text-to-image",
        });
      })
    );
    return bodies;
  }

  it("with the default 9:16 (1080x1920) a gpt-image-2 request sends size 1152x2048", async () => {
    const bodies = stubAtlasFetch();
    const p = new AtlasCloudProvider({ name: "atlas-cloud", apiKey: "test-key", baseUrl: "https://example.com" });
    const result = await p.generateImage({
      modelId: "openai/gpt-image-2/text-to-image",
      mode: "text-to-image",
      prompt: "product shot",
      width: 1080,
      height: 1920,
    });
    expect(bodies).toHaveLength(1);
    expect(bodies[0].size).toBe("1152x2048");
    expect(result.imageUrls).toEqual(["https://example.com/out.png"]);
  });

});
