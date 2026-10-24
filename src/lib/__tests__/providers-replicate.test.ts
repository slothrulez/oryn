import { describe, it, expect, vi } from "vitest";
import { ReplicateProvider } from "@/lib/providers/replicate";

/**
 * ReplicateProvider regression tests: getTaskStatus only has taskId and has no way to know the model,
 * so result.modelId is set to an empty string there; generateImage/generateVideo must back-fill
 * options.modelId before returning (consistent with the other providers), otherwise
 * `/api/ai/image|video` calling NextResponse.json(result) directly would return an empty modelId to the client.
 */
describe("ReplicateProvider modelId backfill (audit fix)", () => {
  // mock HTTP: createPrediction(/models/...) returns starting; getTaskStatus(/predictions/...) returns succeeded
  function mockProvider(output: string[]) {
    const p = new ReplicateProvider({ name: "replicate", apiKey: "test-token", baseUrl: "https://api.replicate.com/v1" });
    vi.spyOn(p as unknown as { request: (path: string) => Promise<unknown> }, "request").mockImplementation(
      async (path: string) => {
        if (path.startsWith("/models/")) return { id: "p1", status: "starting" };
        return { id: "p1", status: "succeeded", output };
      }
    );
    return p;
  }

  it("generateImage backfills modelId (before the fix it was an empty string, losing model info)", async () => {
    const p = mockProvider(["https://example.com/i.png"]);
    const r = await p.generateImage({ modelId: "black-forest-labs/flux-1.1-pro", mode: "text-to-image", prompt: "x" });
    expect(r.modelId).toBe("black-forest-labs/flux-1.1-pro");
    expect(r.imageUrls).toEqual(["https://example.com/i.png"]);
  });

  it("generateVideo backfills modelId", async () => {
    const p = mockProvider(["https://example.com/v.mp4"]);
    const r = await p.generateVideo({ modelId: "owner/video-model", mode: "image-to-video", prompt: "x" });
    expect(r.modelId).toBe("owner/video-model");
    expect(r.videoUrls).toEqual(["https://example.com/v.mp4"]);
  });
});
