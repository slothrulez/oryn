import { describe, it, expect } from "vitest";
import {
  ATLAS_BASE_URL,
  ATLAS_LLM_BASE_URL,
  ATLAS_ONEKEY_MODELS,
  fillAtlasModelDefaults,
} from "@/lib/atlas-onekey";

describe("fillAtlasModelDefaults", () => {
  it("when both are empty, fills in the Atlas default models", () => {
    expect(fillAtlasModelDefaults({})).toEqual({
      image: ATLAS_ONEKEY_MODELS.image,
      video: ATLAS_ONEKEY_MODELS.video,
    });
  });

  it("keeps the user's choice without overwriting it", () => {
    expect(
      fillAtlasModelDefaults({ image: "my/custom-image", video: "my/custom-video" })
    ).toEqual({ image: "my/custom-image", video: "my/custom-video" });
  });

  it("when only one is missing, fills only that one", () => {
    expect(fillAtlasModelDefaults({ image: "keep/this" })).toEqual({
      image: "keep/this",
      video: ATLAS_ONEKEY_MODELS.video,
    });
  });

  it("blank strings count as unselected and fall back to defaults", () => {
    expect(fillAtlasModelDefaults({ image: "   ", video: "" })).toEqual({
      image: ATLAS_ONEKEY_MODELS.image,
      video: ATLAS_ONEKEY_MODELS.video,
    });
  });
});

describe("Atlas one-key setup preset constants", () => {
  it("baseUrl and each tier's model id are configured", () => {
    expect(ATLAS_BASE_URL).toMatch(/^https:\/\/api\.atlascloud\.ai/);
    for (const id of Object.values(ATLAS_ONEKEY_MODELS)) {
      expect(id.length).toBeGreaterThan(0);
    }
  });

  it("the asset gateway uses /api/v1 and the chat gateway uses /v1; they must not be mixed", () => {
    expect(ATLAS_BASE_URL).toBe("https://api.atlascloud.ai/api/v1");
    expect(ATLAS_LLM_BASE_URL).toBe("https://api.atlascloud.ai/v1");
    expect(ATLAS_LLM_BASE_URL).not.toContain("/api/v1");
  });
});
