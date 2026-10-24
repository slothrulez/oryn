import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchAtlasCatalog,
  fetchAtlasInputSchema,
  getCachedAtlasEntry,
  clearAtlasCatalogCache,
  dynamicVideoModels,
  modesFromCatalogEntry,
  type AtlasCatalogEntry,
} from "@/lib/providers/atlas-catalog";

/**
 * Dynamic model discovery (v0.8.76): GET {baseUrl}/models is merged into the video
 * model picker at runtime. Discovery must be strictly additive — any failure returns
 * [] so the static curated catalog is always the floor.
 */

const BASE = "https://api.atlascloud.ai/api/v1";

function okJson(payload: unknown) {
  return { ok: true, status: 200, json: async () => payload } as unknown as Response;
}

const RAW_ROWS = [
  {
    model: "nova/h3/text-to-video",
    type: "Video",
    displayName: "Nova H3 Text-to-Video",
    profile: "2K cinematic video",
    categories: ["TEXT-TO-VIDEO"],
    schema: "https://static.atlascloud.ai/model/schema/nova-h3-text-to-video.json",
    priority: 90038,
    price: { actual: { base_price: "0.14" } },
  },
  {
    model: "xai/grok-imagine-video-v1.5/reference-to-video",
    type: "Video",
    displayName: "Grok Imagine v1.5 Reference-to-Video",
    categories: ["IMAGE-TO-VIDEO"],
    priority: 100,
  },
  { model: "acme/avatar-omni-human-v1.5", type: "Video", displayName: "OmniHuman", categories: ["AUDIO-TO-VIDEO"], priority: 99999 },
  { model: "reelai/reel-video-o3-pro/video-edit", type: "Video", displayName: "O3 Edit", categories: ["VIDEO-TO-VIDEO"], priority: 99999 },
  { model: "openai/gpt-image-2/text-to-image", type: "Image", displayName: "GPT Image 2", categories: ["TEXT-TO-IMAGE"] },
  { model: "atlascloud/mystery-model", type: "Video", displayName: "Mystery", categories: [] },
  { type: "Video", displayName: "dirty data missing the model field" },
];

beforeEach(() => {
  clearAtlasCatalogCache();
});

describe("fetchAtlasCatalog: fetch + cache + fallback on failure", () => {
  it("parses the {code,data} wrapper, filters dirty rows, and hits the sync cache lookup", async () => {
    const fetchImpl = vi.fn(async () => okJson({ code: "200", data: RAW_ROWS }));
    const entries = await fetchAtlasCatalog(BASE, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(entries.length).toBe(RAW_ROWS.length - 1); // dirty row dropped
    const h3 = getCachedAtlasEntry("nova/h3/text-to-video");
    expect(h3?.priceBase).toBe("0.14");
    expect(h3?.schemaUrl).toContain("nova-h3-text-to-video.json");
  });

  it("a second call within the TTL makes no request", async () => {
    const fetchImpl = vi.fn(async () => okJson({ data: RAW_ROWS }));
    await fetchAtlasCatalog(BASE, { fetchImpl: fetchImpl as unknown as typeof fetch });
    await fetchAtlasCatalog(BASE, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("network failure returns [] (no throw, static catalog intact)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });
    const entries = await fetchAtlasCatalog(BASE, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(entries).toEqual([]);
  });

  it("on failure keeps the old cache for the same baseUrl (stale data beats an empty list)", async () => {
    const good = vi.fn(async () => okJson({ data: RAW_ROWS }));
    await fetchAtlasCatalog(BASE, { fetchImpl: good as unknown as typeof fetch });
    const bad = vi.fn(async () => {
      throw new Error("offline");
    });
    const entries = await fetchAtlasCatalog(BASE, {
      fetchImpl: bad as unknown as typeof fetch,
      ttlMs: -1, // force cache expiry so the failed refetch path runs
    });
    expect(entries.length).toBeGreaterThan(0);
  });
});

describe("dynamicVideoModels: drivable-category filter + curated dedupe + popularity sort", () => {
  it("keeps only TEXT/IMAGE-TO-VIDEO categories; digital-human/video-editing/uncategorized models stay out of the dropdown", async () => {
    const fetchImpl = vi.fn(async () => okJson({ data: RAW_ROWS }));
    const entries = await fetchAtlasCatalog(BASE, { fetchImpl: fetchImpl as unknown as typeof fetch });
    const models = dynamicVideoModels(entries, new Set());
    expect(models.map((m) => m.id)).toEqual([
      "nova/h3/text-to-video",
      "xai/grok-imagine-video-v1.5/reference-to-video",
    ]);
  });

  it("ids already in the curated catalog are deduped; descriptions carry the unit price; modes derive from the category (reference adds video-to-video)", async () => {
    const fetchImpl = vi.fn(async () => okJson({ data: RAW_ROWS }));
    const entries = await fetchAtlasCatalog(BASE, { fetchImpl: fetchImpl as unknown as typeof fetch });
    const models = dynamicVideoModels(entries, new Set(["nova/h3/text-to-video"]));
    expect(models.map((m) => m.id)).toEqual(["xai/grok-imagine-video-v1.5/reference-to-video"]);
    expect(models[0].modes).toEqual(["image-to-video", "video-to-video"]);
    expect(models[0].extra?.dynamic).toBe(true);

    const all = dynamicVideoModels(entries, new Set());
    expect(all[0].description).toContain("$0.14/run");
  });

  it("modesFromCatalogEntry: category to unified modes mapping", () => {
    const entry: AtlasCatalogEntry = {
      model: "a/b/text-to-video",
      type: "Video",
      categories: ["TEXT-TO-VIDEO", "IMAGE-TO-VIDEO"],
    };
    expect(modesFromCatalogEntry(entry)).toEqual(["text-to-video", "image-to-video"]);
  });
});

describe("fetchAtlasInputSchema: schema fetch and cache", () => {
  it("returns components.schemas.Input and caches it (no second request); returns undefined on failure", async () => {
    const input = { properties: { prompt: { type: "string" } } };
    const fetchImpl = vi.fn(async () => okJson({ components: { schemas: { Input: input } } }));
    const url = "https://static.atlascloud.ai/model/schema/x.json";
    expect(await fetchAtlasInputSchema(url, fetchImpl as unknown as typeof fetch)).toEqual(input);
    expect(await fetchAtlasInputSchema(url, fetchImpl as unknown as typeof fetch)).toEqual(input);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const bad = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await fetchAtlasInputSchema("https://static.atlascloud.ai/other.json", bad as unknown as typeof fetch)).toBeUndefined();
  });
});
